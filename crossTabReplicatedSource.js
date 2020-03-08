import realtimeEvents from "../constants/events";

if (typeof Roblox === "undefined") {
    Roblox = {};
}
Roblox.RealTime = Roblox.RealTime || {};
Roblox.RealTime.Sources = Roblox.RealTime.Sources || {};

const crossTabReplicatedSource = function (settings, logger) {
    var subscriberNamespace = 'Roblox.RealTime.Sources.CrossTabReplicatedSource';
    var isRunning = false;

    var onSourceExpiredHandler;
    var onNotificationHandler;
    var onConnectionEventHandler;

    var log = function (message, isVerbose) {
        if (logger) {
            logger('CrossTabReplicatedSource: ' + message, isVerbose);
        }
    };

    var isAvailable = function () {
        if (!Roblox.CrossTabCommunication || !Roblox.CrossTabCommunication.Kingmaker || !Roblox.CrossTabCommunication.PubSub) {
            log('CrossTabCommunication dependencies are not present');
            return false;
        }
        if (!Roblox.CrossTabCommunication.Kingmaker.IsAvailable()) {
            log('CrossTabCommunication.Kingmaker not available - cannot pick a master tab');
            return false;
        }
        if (Roblox.CrossTabCommunication.Kingmaker.IsMasterTab()) {
            log('This is the master tab - it needs to send the events, not listen to them');
            return false;
        }
        return true;
    };

    var subscribeToEvents = function () {
        Roblox.CrossTabCommunication.Kingmaker.SubscribeToMasterChange(function (isMasterTab) {
            if (isMasterTab && isRunning && onSourceExpiredHandler) {
                log('Tab has been promoted to master tab - triggering end of this source');
                onSourceExpiredHandler();
            }
        });
        Roblox.CrossTabCommunication.PubSub.Subscribe(realtimeEvents.Notification, subscriberNamespace, function (notification) {
            log('Notification Received: ' + notification, true);
            if (notification) {
                onNotificationHandler(JSON.parse(notification));
            }
        });
        Roblox.CrossTabCommunication.PubSub.Subscribe(realtimeEvents.ConnectionEvent, subscriberNamespace, function (event) {
            log('Connection Event Received: ' + event);
            if (event) {
                onConnectionEventHandler(JSON.parse(event));
            }
        });
    };

    var requestConnectionStatus = function () {
        Roblox.CrossTabCommunication.PubSub.Publish(realtimeEvents.RequestForConnectionStatus, Roblox.RealTime.Events.RequestForConnectionStatus);
    };

    var stop = function () {
        log('Stopping. Unsubscribing from Cross-Tab events');
        isRunning = false;
        Roblox.CrossTabCommunication.PubSub.Unsubscribe(realtimeEvents.Notification, subscriberNamespace);
        Roblox.CrossTabCommunication.PubSub.Unsubscribe(realtimeEvents.ConnectionEvent, subscriberNamespace);
    };

    var start = function (onSourceExpired, onNotification, onConnectionEvent) {
        if (!isAvailable()) {
            return false;
        }
        isRunning = true;

        onSourceExpiredHandler = onSourceExpired;
        onNotificationHandler = onNotification;
        onConnectionEventHandler = onConnectionEvent;

        subscribeToEvents();
        requestConnectionStatus();

        return true;
    };

    // Public API
    this.IsAvailable = isAvailable;
    this.Start = start;
    this.Stop = stop;
    this.Name = "CrossTabReplicatedSource";
};

export default crossTabReplicatedSource;