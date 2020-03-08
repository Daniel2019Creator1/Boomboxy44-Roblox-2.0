import signalRSource from "../sources/signalRSource";
import hybridSource from "../sources/hybridSource";
import crossTabReplicatedSource from "../sources/crossTabReplicatedSource";
import realtimeClient from "./client";
import { RealTimeSettings, CurrentUser, LocalStorage } from "Roblox";

const realtimeFactory = function () {
    "use strict";
    var client = null;

    var getClient = function () {
        if (client === null) {
            client = initialiseSingletonClient();
        }
        return client;
    }

    var initialiseSingletonClient = function () {
        var sources = [];
        if (hybridSource) {
            sources.push(hybridSource);
        }
        if (crossTabReplicatedSource) {
            sources.push(crossTabReplicatedSource);
        }
        if (signalRSource) {
            sources.push(signalRSource);
        }

        return new realtimeClient(sources);
    }

    var parseToIntOrNull = function (raw) {
        var parsed = parseInt(raw);
        if (!isNaN(parsed)) {
            return parsed;
        } else {
            return null;
        }
    };

    var settings = null;
    var getSettings = function () {
        if (settings === null) {
            settings = {};
            if (RealTimeSettings){
                settings.notificationsUrl = RealTimeSettings.NotificationsEndpoint;
                settings.maxConnectionTimeInMs = parseInt(RealTimeSettings.MaxConnectionTime); // six hours
                settings.isEventPublishingEnabled = RealTimeSettings.IsEventPublishingEnabled;
                settings.isDisconnectOnSlowConnectionDisabled = RealTimeSettings.IsDisconnectOnSlowConnectionDisabled;
                settings.userId = CurrentUser ? parseInt(CurrentUser.userId) : -1;
                settings.isSignalRClientTransportRestrictionEnabled = RealTimeSettings.IsSignalRClientTransportRestrictionEnabled;
                settings.isLocalStorageEnabled = RealTimeSettings.IsLocalStorageInRealTimeEnabled;
            } else {
                settings.notificationsUrl = "https://realtime.roblox.com";
                settings.maxConnectionTimeInMs = 21600000; // six hours
                settings.isEventPublishingEnabled = false;
                settings.isDisconnectOnSlowConnectionDisabled = false;
                settings.userId = CurrentUser ? parseInt(CurrentUser.userId) : -1;
                settings.isSignalRClientTransportRestrictionEnabled = false;
                settings.isLocalStorageEnabled = false;
            }
        }
        return settings;
    };
    
    var getNotificationsUrl = function () {
        return getSettings().notificationsUrl;
    };

    var getMaximumConnectionTime = function () {
        return getSettings().maxConnectionTimeInMs;
    };

    var isEventPublishingEnabled = function () {
        return getSettings().isEventPublishingEnabled;
    };

    var isLocalStorageEnabled = function () {
        if (LocalStorage) {
            return LocalStorage.isAvailable() && getSettings().isLocalStorageEnabled;
        }
        return localStorage && getSettings().isLocalStorageEnabled;
    };

    var getUserId = function () {
        return getSettings().userId;
    };

    return {
        GetClient: getClient,
        GetNotificationsUrl: getNotificationsUrl,
        GetMaximumConnectionTime: getMaximumConnectionTime,
        IsEventPublishingEnabled: isEventPublishingEnabled,
        IsLocalStorageEnabled: isLocalStorageEnabled,
        GetUserId: getUserId,
        GetSettings: getSettings
    };
}();

export default realtimeFactory;