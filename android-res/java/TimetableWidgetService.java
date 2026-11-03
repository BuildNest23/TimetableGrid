package com.timetablegrid.app;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/** Feeds the scrollable class list inside the widget. */
public class TimetableWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    private static class Factory implements RemoteViewsFactory {
        private final Context ctx;
        private List<WidgetLogic.Row> rows = new ArrayList<>();

        Factory(Context ctx) {
            this.ctx = ctx;
        }

        @Override public void onCreate() { load(); }
        @Override public void onDataSetChanged() { load(); }
        @Override public void onDestroy() { rows.clear(); }
        @Override public int getCount() { return rows.size(); }

        private void load() {
            rows = WidgetLogic.compute(WidgetLogic.loadSnapshot(ctx), Calendar.getInstance()).rows;
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.timetable_widget_row);
            if (position < 0 || position >= rows.size()) return v;
            WidgetLogic.Row r = rows.get(position);
            v.setTextViewText(R.id.row_class, r.cls);
            v.setTextViewText(R.id.row_detail, r.detail);
            v.setTextColor(R.id.row_detail, r.color);
            v.setOnClickFillInIntent(R.id.row_root, new Intent());
            return v;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }
    }
}
