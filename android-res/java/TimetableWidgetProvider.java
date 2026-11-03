package com.timetablegrid.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;
import java.util.Calendar;

/**
 * Home-screen widget: shows the running period and what every class is doing.
 * Refreshes itself once a minute (inexact alarm, no special permission) and whenever the app saves.
 */
public class TimetableWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_TICK = "com.timetablegrid.app.WIDGET_TICK";

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) update(context, mgr, id);
        scheduleNextTick(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_TICK.equals(intent.getAction())) {
            refreshAll(context);
        }
    }

    @Override
    public void onEnabled(Context context) {
        scheduleNextTick(context);
    }

    @Override
    public void onDisabled(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(tickIntent(context));
    }

    /** Redraws every widget instance and re-arms the minute timer. */
    static void refreshAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, TimetableWidgetProvider.class));
        if (ids.length == 0) return;
        for (int id : ids) update(context, mgr, id);
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
        scheduleNextTick(context);
    }

    private static void update(Context context, AppWidgetManager mgr, int id) {
        WidgetLogic.Status st = WidgetLogic.compute(WidgetLogic.loadSnapshot(context), Calendar.getInstance());

        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.timetable_widget);
        v.setTextViewText(R.id.widget_title, st.title);
        v.setTextViewText(R.id.widget_subtitle, st.subtitle);
        v.setProgressBar(R.id.widget_progress, 100, st.progress, false);
        v.setViewVisibility(R.id.widget_progress, st.showProgress ? android.view.View.VISIBLE : android.view.View.GONE);
        v.setTextViewText(R.id.widget_note, st.note);
        v.setViewVisibility(R.id.widget_note, st.note.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);

        Intent svc = new Intent(context, TimetableWidgetService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.widget_list, svc);
        v.setEmptyView(R.id.widget_list, R.id.widget_empty);

        // Tapping anywhere opens the app
        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        PendingIntent open = PendingIntent.getActivity(context, 0, launch, flags);
        v.setOnClickPendingIntent(R.id.widget_header, open);
        v.setPendingIntentTemplate(R.id.widget_list, open);

        mgr.updateAppWidget(id, v);
    }

    private static PendingIntent tickIntent(Context context) {
        Intent i = new Intent(context, TimetableWidgetProvider.class).setAction(ACTION_TICK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(context, 1, i, flags);
    }

    private static void scheduleNextTick(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar next = Calendar.getInstance();
        next.add(Calendar.MINUTE, 1);
        next.set(Calendar.SECOND, 1);
        next.set(Calendar.MILLISECOND, 0);
        am.set(AlarmManager.RTC, next.getTimeInMillis(), tickIntent(context));
    }
}
