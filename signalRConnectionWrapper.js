import { Utilities, CurrentUser } from "Roblox";

const signalRConnectionWrapper = function (settings, logger, onConnectionStatusChangedCallback, onNotificationCallback, onSubscriptionStatusCallback) {
    var self = this;

    // Interface
    self.Start = start;
    self.Stop = stop;
    self.Restart = restart;
    self.IsConnected = getIsConnected;

    // SignalR Constants
    var signalRStateConversion = { 0: 'connecting', 1: 'connected', 2: 'reconnecting', 4: 'disconnected' };
    var signalRState = { connecting: 0, connected: 1, reconnecting: 2, disconnected: 4 };

    var signalrConnection = null;
    var isConnected = false;
    var exponentialBackoff = getExponentialBackoff();

    function start() {
        signalrConnection = setupSignalRConnection();
        signalrConnection.start(getConnectionOptions()).done(function () {
            log('Connected to SignalR [' + signalrConnection.transport.name + ']');
        }).fail(function (args) {
            log('FAILED to connect to SignalR [' + args + ']');
        });
    }

    function stop() {
        if (signalrConnection) {
            $(signalrConnection).unbind();//unbind all events to stop onDisconnected from triggering
            signalrConnection.stop();
            signalrConnection = null;
        }
        onConnectionStatusChangedCallback(false);
    }

    function restart() {
        if (signalrConnection === null) {
            start();
        } else {
            signalrConnection.stop();
            // this will trigger an automatic restart
        }
    }

    function getIsConnected() {
        return isConnected;
    }

    function setupSignalRConnection() {
        var notificationsBaseUrl = settings.notificationsUrl;

        var connection = $.hubConnection(notificationsBaseUrl + "/notifications", { useDefaultPath: false });
        var userNotificationsHub = connection.createHubProxy('userNotificationHub');

        // Subscribe to events raised by the server(magikx)
        userNotificationsHub.on('notification', onNotificationCallback);
        userNotificationsHub.on('subscriptionStatus', onSubscriptionStatusCallback);

        // Wire up signalR connection state change events
        connection.stateChanged(handleSignalRStateChange);
        connection.disconnected(handleSignalRDisconnected);
        connection.reconnecting(handleSignalRReconnecting);

        return connection;
    }

    function getAllowedTransports() {
        if (window.WebSocket) {
            return ['webSockets'];
        } else {
            return ['webSockets', 'longPolling'];
        }
    }

    function getConnectionOptions() {
        var connectionOptions = {
            pingInterval: null
        };

        if (settings.isSignalRClientTransportRestrictionEnabled) {
            connectionOptions.transport = getAllowedTransports();
        }

        return connectionOptions;
    }

    function handleSignalRStateChange(state) {
        if (state.newState === signalRState.connected) {
            isConnected = true;
            onConnectionStatusChangedCallback(true);
        } else if (state.oldState === signalRState.connected && isConnected) {
            isConnected = false;
            onConnectionStatusChangedCallback(false); 
        }

        log('Connection Status changed from [' + signalRStateConversion[state.oldState] + '] to [' + signalRStateConversion[state.newState] + ']');
    }

    function handleSignalRDisconnected() {
        // after connection failure attempt automatic reconnect after a suitable delay
        var delay = exponentialBackoff.StartNewAttempt();
        log('In disconnected handler. Will attempt Reconnect after ' + delay + 'ms');

        setTimeout(function () {
            var attemptCount = exponentialBackoff.GetAttemptCount();
            if (attemptCount === 1) {
                var userId = "userId: " + CurrentUser && CurrentUser.userId;
                GoogleAnalyticsEvents && GoogleAnalyticsEvents.FireEvent(["SignalR", "Attempting to Reconnect", userId]);
            }
            log('Attempting to Reconnect [' + exponentialBackoff.GetAttemptCount() + ']...');
            if (signalrConnection == null) {
                return;
            }
            signalrConnection.start(getConnectionOptions()).done(function () {
                exponentialBackoff.Reset();
                log('Connected Again!');
            }).fail(function () {
                log('Failed to Reconnect!');
            });
        }, delay);
    }

    function handleSignalRReconnecting() {
        log('In reconnecting handler. Attempt to force disconnect.');
        signalrConnection.stop(); // To trigger backed-off reconnect logic
    }

    function getExponentialBackoff() {
        if (!Utilities) {
            return false;
        }
        // Exponential Backoff Configuration
        var regularBackoffSpec = new Utilities.ExponentialBackoffSpecification({
            firstAttemptDelay: 2000,
            firstAttemptRandomnessFactor: 3,
            subsequentDelayBase: 10000,
            subsequentDelayRandomnessFactor: 0.5,
            maximumDelayBase: 300000
        });
        var fastBackoffSpec = new Utilities.ExponentialBackoffSpecification({
            firstAttemptDelay: 20000,
            firstAttemptRandomnessFactor: 0.5,
            subsequentDelayBase: 40000,
            subsequentDelayRandomnessFactor: 0.5,
            maximumDelayBase: 300000
        });
        var fastBackoffThreshold = 60000; // maximum time between reconnects to trigger fast backoff mode

        var fastBackoffPredicate = function (exponentialBackoff) {
            var lastSuccessfulConnection = exponentialBackoff.GetLastResetTime();

            // If we are attempting to reconnect again shortly after having reconnected, it may indicate
            // server instability, in which case we should backoff more quickly
            if (lastSuccessfulConnection && (lastSuccessfulConnection + fastBackoffThreshold) > new Date().getTime()) {
                return true;
            }
            return false;
        };

        return new Utilities.ExponentialBackoff(regularBackoffSpec, fastBackoffPredicate, fastBackoffSpec);
    }

    function log (msg) {
        if(logger) {
            logger(msg);
        }
    }
};

export default signalRConnectionWrapper;