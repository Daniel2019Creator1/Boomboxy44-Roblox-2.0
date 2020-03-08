import realtimeFactory from "./factory";
import { EventStream } from "Roblox";

const realtimeStateTracker = function (localStoragePersistenceEnabled, eventPublishingEnabled, loggingFunction) {

    var refreshRequiredEnum = {
        IS_REQUIRED: 1,
        NOT_REQUIRED: 2,
        UNCLEAR: 3
    };
    
    var latestRealTimeInformationPrefix = "Roblox.RealTime.StateTracker.LastNamespaceSequenceNumberProcessed_U_";
    var eventStreamEvents = {
        RealTimeCheckIfDataReloadRequired: "realTimeCheckIfDataReloadRequired",
        RealTimeUpdateLatestSequenceNumber: "realTimeUpdateLatestSequenceNumber"
    };
    var eventStreamContexts = {
        OutOfOrder: "SequenceOutOfOrder",
        MissedNumber: "SequenceNumberMissed",
        UpToDate: "SequenceNumberMatched",
        TimeExpired: "TimeStampExpired",
        InvalidSequenceNumber: "InvalidSequenceNumber",
        MissingNotificationInfo: "MissingNotificationInformation"
    }

    var currentRecordedState = null;

    function log(content) {
        if (typeof loggingFunction === "function") {
            loggingFunction(content);
        }
    }

    function getRealTimeStateKey() {
        var key = latestRealTimeInformationPrefix + realtimeFactory.GetUserId();
        return key;
    }

    function init() {
        log('StateTracker Initialized');
        if (localStoragePersistenceEnabled) {
            var storedValue = localStorage.getItem(getRealTimeStateKey());
            if (storedValue) {
                currentRecordedState = safeParse(storedValue);
            }
        }
    }

    function updateCurrentState(namespace, sequenceNumber) {
        if (!currentRecordedState || !currentRecordedState.namespaceSequenceNumbersObj) {
            currentRecordedState = {
                namespaceSequenceNumbersObj: {}
            };
        }
        currentRecordedState.namespaceSequenceNumbersObj[namespace] = sequenceNumber;
        currentRecordedState["TimeStamp"] = Date.now();

        if (localStoragePersistenceEnabled) {
            localStorage.setItem(getRealTimeStateKey(), JSON.stringify(currentRecordedState));
        }
    }

    function safeParse(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            log('Error parsing jsonString');
            return null;
        }
    }

    function pushToEventStream(eventName, eventContext, properties) {
        try {
            if (eventPublishingEnabled && EventStream) {
                if (typeof properties != "object") {
                    properties = {};
                }
                properties.ua = navigator.userAgent;
                EventStream.SendEvent(eventName, eventContext, properties);
            }
        } catch (e) {
            log('Error pushing to Event Stream');
        }
    }

    var getLatestState = function () {
        return currentRecordedState;
    }

    // returns RefreshRequiredEnum
    var isDataReloadRequired = function (namespace, newlyReportedSequenceNumber) {

        // If we are not receiving a valid sequence number, we should not take any action based on it
        // Do not want to risk triggering mass reconnects until we are conviced all platforms are respecting
        // and relaying sequnce numbers correctly
        if (typeof newlyReportedSequenceNumber !== "number") {
            pushToEventStream(eventStreamEvents.RealTimeCheckIfDataReloadRequired, eventStreamContexts.InvalidSequenceNumber, { rld: true });
            return refreshRequiredEnum.UNCLEAR;
        }
        if (newlyReportedSequenceNumber <= 0) {
            return refreshRequiredEnum.UNCLEAR;
        }

        var currentRecordedSequenceNumber = getLatestState();

        if (typeof currentRecordedSequenceNumber === "undefined" || currentRecordedSequenceNumber == null) {
            pushToEventStream(eventStreamEvents.RealTimeCheckIfDataReloadRequired, eventStreamContexts.MissingNotificationInfo, { rld: true });
            updateCurrentState(namespace, newlyReportedSequenceNumber);

            return refreshRequiredEnum.UNCLEAR;
        }
        
        var currentSequenceNumber = currentRecordedSequenceNumber.namespaceSequenceNumbersObj[namespace];
        if (newlyReportedSequenceNumber === currentSequenceNumber) {
            updateCurrentState(namespace, newlyReportedSequenceNumber);
            pushToEventStream(eventStreamEvents.RealTimeCheckIfDataReloadRequired, eventStreamContexts.UpToDate, { rld: false });
            return refreshRequiredEnum.NOT_REQUIRED;
        } else {
            pushToEventStream(eventStreamEvents.RealTimeCheckIfDataReloadRequired, eventStreamContexts.MissedNumber, { rld: true });
            if (newlyReportedSequenceNumber > currentSequenceNumber) {
                updateCurrentState(namespace, newlyReportedSequenceNumber);
                pushToEventStream(eventStreamEvents.RealTimeCheckIfDataReloadRequired, eventStreamContexts.OutOfOrder, { rld: true });
                return refreshRequiredEnum.IS_REQUIRED;
            } else {
                if (!currentSequenceNumber) {
                    updateCurrentState(namespace, newlyReportedSequenceNumber);
                }
                return refreshRequiredEnum.UNCLEAR;
            }
        }
    };

    var updateSequenceNumber = function (namespace, sequenceNumber) {
        if (typeof sequenceNumber !== "number") {
            pushToEventStream(eventStreamEvents.RealTimeUpdateLatestSequenceNumber, eventStreamContexts.InvalidSequenceNumber);
            return;
        }

        var latestNotificationInfo = getLatestState();
        
        if (typeof latestNotificationInfo === "object" && latestNotificationInfo != null
            && latestNotificationInfo.namespaceSequenceNumbersObj && latestNotificationInfo.namespaceSequenceNumbersObj[namespace] > sequenceNumber) {
            pushToEventStream(eventStreamEvents.RealTimeUpdateLatestSequenceNumber, eventStreamContexts.OutOfOrder);
        }

        updateCurrentState(namespace, sequenceNumber);
    };

    init();

    this.IsDataRefreshRequired = isDataReloadRequired;
    this.UpdateSequenceNumber = updateSequenceNumber;
    this.GetLatestState = getLatestState;
    this.RefreshRequiredEnum = refreshRequiredEnum;
};

export default realtimeStateTracker;