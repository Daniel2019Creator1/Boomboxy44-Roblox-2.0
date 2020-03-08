import realtimeFactory from "../lib/factory";
import { Endpoints } from "Roblox";

$(function () {
    realtimeFactory.GetClient().Subscribe("AuthenticationNotifications", function (data) {
        if (data.Type === "SignOut") {
            var url = "/authentication/is-logged-in";
            if (Endpoints) {
                url = Endpoints.generateAbsoluteUrl(url, null, true);
            }
            $.ajax({
                url: url,
                method: "GET",
                error: function(response) {
                    if (response.status === 401) {
                        window.location.reload();
                    }
                }
            });
        }
    });
})