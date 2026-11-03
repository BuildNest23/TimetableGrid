package com.timetablegrid.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives the week snapshot from the web app and refreshes any widgets on the home screen. */
@CapacitorPlugin(name = "TimetableWidget")
public class TimetableWidgetPlugin extends Plugin {

    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        WidgetLogic.saveSnapshot(getContext(), json);
        TimetableWidgetProvider.refreshAll(getContext());
        call.resolve(new JSObject());
    }
}
