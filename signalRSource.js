import realtimeEvents from "../constants/events";
import signalRConnectionWrapper from "../lib/signalRConnectionWrapper";
import { CrossTabCommunication } from "Roblox";

const signalRSource = function (settings, logger) {
    var isAvailable = function () {
        return true;
    };

    var subscriptionStatusUpdateTypes =
    {
        connectionLost: 'ConnectionLost',
        reconnected: 'Reconnected',
        subscribed: 'Subscribed'
    };

    var onSourceExpiredHandler;
    var onNotificationHandler;
    var onConnectionEventHandler;

    // State
    var isCurrentlyConnected = false;
    var isReplicationEnabled = false;

    var signalRConnectionTimeout = null;
    var hasConnectionSucceeded = false;
    var waitForSubscriptionStatusTimeout = null;
    var waitForSubscriptionStatusTimeoutWait = 2000;

    var lastSequenceNumber = -1;
    var lastNamespaceSequenceNumberObj = {};

    var signalRConnection = null;

    var log = function (message, isVerbose) {
        if (logger) {
            logger('SignalRSource: ' + message, isVerbose);
        }
    };

    var setupReplication = function () {
        if (!CrossTabCommunication || !CrossTabCommunication.Kingmaker || !CrossTabCommunication.PubSub) {
            log('CrossTabCommunication dependencies required for replication are not present - will not replicate notifications');
            isReplicationEnabled = false;
            return;
        }

        CrossTabCommunication.Kingmaker.SubscribeToMasterChange(function (isMasterTab) {
            isReplicationEnabled = isMasterTab;
            if (!isMasterTab) {
                onSourceExpiredHandler();
            }
        });
        isReplicationEnabled = CrossTabCommunication.Kingmaker.IsMasterTab();
        CrossTabCommunication.PubSub.Subscribe(realtimeEvents.RequestForConnectionStatus, 'Roblox.RealTime.Sources.SignalRSource', function () {
            if (isReplicationEnabled) {
                var connectionEvent = {
                    isConnected: isCurrentlyConnected,
                    sequenceNumber: lastSequenceNumber,
                    namespaceSequenceNumbersObj: lastNamespaceSequenceNumberObj
                };
                log('Responding to request for connection status: ' + JSON.stringify(connectionEvent));
                CrossTabCommunication.PubSub.Publish(realtimeEvents.ConnectionEvent, JSON.stringify(connectionEvent));
            }
        });
    };

    var handleNotificationMessage = function (namespace, detail, sequenceNumber) {
        var parsedDetail = JSON.parse(detail);
        var namespaceSequenceNumber = parsedDetail.SequenceNumber || 0;
        var notification = {
            namespace: namespace,
            detail: parsedDetail,
            sequenceNumber: sequenceNumber,
            namespaceSequenceNumber: namespaceSequenceNumber
        };
        log("Notification received: " + JSON.stringify(notification), true);
        lastSequenceNumber = sequenceNumber || -1;
        lastNamespaceSequenceNumberObj[namespace] = namespaceSequenceNumber || -1;

        onNotificationHandler(notification);
        if (isReplicationEnabled) {
            log("Replicating Notification");
            CrossTabCommunication.PubSub.Publish(realtimeEvents.Notification, JSON.stringify(notification));
        }
    };

    var processConnectionEvent = function (isConnected, subscriptionStatus) {
        isCurrentlyConnected = isConnected;

        var connectionEvent = {
            isConnected: isConnected
        };

        var sequenceNumber = subscriptionStatus? subscriptionStatus.SequenceNumber : null;
        var namespaceSequenceNumbersObj = subscriptionStatus ? subscriptionStatus.NamespaceSequenceNumbers : {};
        namespaceSequenceNumbersObj = namespaceSequenceNumbersObj || {};
        if (sequenceNumber) {
            connectionEvent.sequenceNumber = sequenceNumber;
            lastSequenceNumber = sequenceNumber;
        } else {
            lastSequenceNumber = -1;
        }

        if (namespaceSequenceNumbersObj.constructor === Object && Object.keys(namespaceSequenceNumbersObj).length > 0) {
            connectionEvent.namespaceSequenceNumbersObj = namespaceSequenceNumbersObj;
            lastNamespaceSequenceNumberObj = namespaceSequenceNumbersObj;
        } else {
            lastNamespaceSequenceNumberObj = {};
        }

        log('Sending Connection Event: ' + JSON.stringify(connectionEvent));
        onConnectionEventHandler(connectionEvent);
        if (isReplicationEnabled) {
            log('Replicating Connection Event.');
            CrossTabCommunication.PubSub.Publish(realtimeEvents.ConnectionEvent, JSON.stringify(connectionEvent));
        }
    };

    var stopExistingSignalRTimeout = function () {
        $(window).unbind('focus.enforceMaxTimeout');
        if (signalRConnectionTimeout !== null) {
            clearTimeout(signalRConnectionTimeout);
            signalRConnectionTimeout = null;
        }
    };

    var setupSignalRTimeout = function () {
        stopExistingSignalRTimeout();
        signalRConnectionTimeout = setTimeout(function () {
            processConnectionEvent(false); //This is done before endConnection so that the replicator doesnt get nulled out. We want to replicate this message.
            signalRConnection.Stop();
            $(window).unbind('focus.enforceMaxTimeout').bind('focus.enforceMaxTimeout', function () {
                signalRConnection.Start();
                setupSignalRTimeout();
            });
        }, settings.maxConnectionTimeInMs);
    };

    var relayConnectionEventAfterWaitingRequestedTime = function (subscriptionStatus) {
        if (waitForSubscriptionStatusTimeout !== null) {
            clearTimeout(waitForSubscriptionStatusTimeout);
            waitForSubscriptionStatusTimeout = null;
        }

        if (subscriptionStatus.MillisecondsBeforeHandlingReconnect > 0) {
            log("Waiting " + subscriptionStatus.MillisecondsBeforeHandlingReconnect + 'ms to send Reconnected signal');

            setTimeout(function () {
                if (signalRConnection.IsConnected()) {
                    processConnectionEvent(true, subscriptionStatus);
                }
            }, subscriptionStatus.MillisecondsBeforeHandlingReconnect);
        } else {
            if (signalRConnection.IsConnected()) {
                processConnectionEvent(true, subscriptionStatus);
            }
        }
    };

    var handleSubscriptionStatusUpdateMessage = function (updateType, detailString) {
        try {
            log('Status Update Received: [' + updateType + ']' + detailString);
        } catch (e) {
        }

        if (updateType === subscriptionStatusUpdateTypes.connectionLost) {
            // If the server loses its subscription to events, we will attempt
            // to restart the signalR connections and treat it like a standard
            // connection drop

            log('Server Backend Connection Lost!');
            signalRConnection.Restart();
        } else if (updateType === subscriptionStatusUpdateTypes.reconnected) {
            log('Server reconnected');
            relayConnectionEventAfterWaitingRequestedTime(JSON.parse(detailString));
        } else if (updateType === subscriptionStatusUpdateTypes.subscribed) {
            var detail = JSON.parse(detailString);
            log('Server connected');

            if (!hasConnectionSucceeded) {
                // if this client hasn't connected before, allow them to connect immediately
                hasConnectionSucceeded = true;
                detail.MillisecondsBeforeHandlingReconnect = 0;
            }

            relayConnectionEventAfterWaitingRequestedTime(detail);
        }
    };

    var handleSignalRConnectionChanged = function (isConnected) {
        if (isConnected) {
            // wait till we receive a subscription status message, but if we don't receive it take action
            waitForSubscriptionStatusTimeout = setTimeout(function () {
                waitForSubscriptionStatusTimeout = null;
                if (signalRConnection.IsConnected()) {
                    hasConnectionSucceeded = true;
                    processConnectionEvent(true);
                }
            }, waitForSubscriptionStatusTimeoutWait);
        } else {
            processConnectionEvent(false);
        }
    };

    var start = function (onSourceExpired, onNotification, onConnectionEvent) {
        onSourceExpiredHandler = onSourceExpired;
        onNotificationHandler = onNotification;
        onConnectionEventHandler = onConnectionEvent;

        setupReplication();
        signalRConnection = new signalRConnectionWrapper(settings, logger, handleSignalRConnectionChanged, handleNotificationMessage, handleSubscriptionStatusUpdateMessage);
        signalRConnection.Start();
        setupSignalRTimeout();

        log('Started');

        return true;
    };

    var stop = function () {
        stopExistingSignalRTimeout();
        if (signalRConnection) {
            signalRConnection.Stop();
        }
    };

    // Public API
    this.IsAvailable = isAvailable;
    this.Start = start;
    this.Stop = stop;
    this.Name = "SignalRSource";
};

export default signalRSource;