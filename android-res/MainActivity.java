package com.timetablegrid.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins must be registered before super.onCreate()
        registerPlugin(TimetableWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
