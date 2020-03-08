import realtimeFactory from "../lib/factory";

var domLoggerReady = false;
var domLogger;
var messageQueue = [];
var realTimeClient;
var log = function (message, color) {
    try {
        if (console && console.log) {
            console.log("REALTIME DEBUGGER: " + message);
        }
        if (domLoggerReady) {
            var messageColor = color || 'black';
            var dt = new Date();
            var time = dt.getHours() + ":" + dt.getMinutes() + ":" + dt.getSeconds() + ": ";
            domLogger.append("<div style='color:" + messageColor + "; margin-bottom:2px; border-bottom:1px solid black; font-size: 11px;'>" + time + message + "</div>");
            domLogger.scrollTop(domLogger[0].scrollHeight);
        } else {
            messageQueue.push(message);
        }
    } catch (e) {

    }
};

var toggleShowLog = function () {
    domLogger.toggle();
};

var checkStatus = function () {
    var isConnected = realTimeClient.IsConnected();
    log('SignalrR Connected:' + isConnected);
    showStatus(isConnected);
};

var showStatus = function (isConnected) {
    var color = isConnected ? 'green' : 'red';
    $('#realtimeDebuggerCheckStatusButton').css('background-color', color);
};

var init = function () {
    realTimeClient = realtimeFactory.GetClient();
    realTimeClient.SetLogger(log);
    realTimeClient.SetVerboseLogging(true);

    $(function () {
        var html = "";
        html += "<div id='realtimeDebuggerControlPanel' style=' position: fixed; z-index: 2147483647; background-color: #aaaaaa; right: 24px; top: 24px; opacity: 0.9; '>";
        html += "<button id='realtimeDebuggerCheckStatusButton'>?</button>";
        html += "<button id='realtimeDebuggerToggleLogButton'>+/-</button>";
        html += "</div>";
        html += "<div id='realtimeDebuggerLog' style='display: none; position: fixed; z-index: 2147483647; background-color: #aaaaaa; right: 24px; top: 44px; opacity: 0.9; height: 70%; width: 70%; overflow-y: scroll;'/>";
        $('body').prepend(html);
        domLogger = $('#realtimeDebuggerLog');
        domLoggerReady = true;
        for (var i = 0; i < messageQueue.length; i++) {
            log(messageQueue[i]);
        }
        messageQueue = [];
        $('#realtimeDebuggerCheckStatusButton').click(checkStatus);
        $('#realtimeDebuggerToggleLogButton').click(toggleShowLog);
        realTimeClient.Subscribe('ChatNotifications', function (message) {
            log(JSON.stringify(message), 'darkblue');
        });
        realTimeClient.SubscribeToConnectionEvents(function () {
            log('Connection Event: connected');
            showStatus(true);
        }, function () {
            log('Connection Event: reconnected');
            showStatus(true);
        }, function () {
            log('Connection Event: disconnected');
            showStatus(false);
        },
            'ChatNotifications');
        checkStatus();
    });
};


const debuggerInit = init;
export default { debuggerInit };