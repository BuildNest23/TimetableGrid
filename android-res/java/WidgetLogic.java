package com.timetablegrid.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Works out "what is running right now" from the snapshot the web app saved.
 * Mirrors getLiveScheduleStatus() in src/utils/liveSchedule.ts.
 */
final class WidgetLogic {
    private static final String PREFS = "timetable_widget";
    private static final String KEY = "snapshot";

    static final int COLOR_TEXT = Color.parseColor("#1F2937");
    static final int COLOR_MUTED = Color.parseColor("#6B7280");
    static final int COLOR_ABSENT = Color.parseColor("#B3261E");

    static final class Row {
        String cls;
        String detail;
        int color;
    }

    static final class Status {
        String title = "";
        String subtitle = "";
        String note = "";
        int progress = 0;
        boolean showProgress = false;
        List<Row> rows = new ArrayList<>();
    }

    private WidgetLogic() {}

    static void saveSnapshot(Context ctx, String json) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit().putString(KEY, json).apply();
    }

    static JSONObject loadSnapshot(Context ctx) {
        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            return raw == null ? null : new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static Status compute(JSONObject snap, Calendar cal) {
        Status st = new Status();
        if (snap == null) {
            st.title = "TimetableGrid";
            st.subtitle = "Open the app once to load your timetable";
            return st;
        }

        int dayIdx = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7; // Monday = 0 ... Sunday = 6
        int now = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);

        JSONObject week = snap.optJSONObject("week");
        JSONArray slots = week == null ? null : week.optJSONArray(String.valueOf(dayIdx));
        if (slots == null) {
            st.title = "School closed today";
            st.subtitle = "Not a regular school day";
            return st;
        }
        if (slots.length() == 0) {
            st.title = "Timings not set";
            st.subtitle = "Add period times in School Setup";
            return st;
        }

        JSONObject first = slots.optJSONObject(0);
        JSONObject last = slots.optJSONObject(slots.length() - 1);

        if (now < first.optInt("s")) {
            int until = first.optInt("s") - now;
            st.title = "Before school";
            st.subtitle = first.optString("l") + " starts at " + first.optString("ss") + " (" + until + " min)";
            int firstPeriod = nextPeriodIndex(slots, 0);
            if (firstPeriod >= 0) {
                fillRows(st, snap, cal, dayIdx, slots, firstPeriod);
                if (!st.rows.isEmpty()) st.note = "Up next: " + slots.optJSONObject(firstPeriod).optString("l");
            }
            return st;
        }
        if (now >= last.optInt("e")) {
            st.title = "School day over";
            st.subtitle = "All periods have finished";
            return st;
        }

        for (int i = 0; i < slots.length(); i++) {
            JSONObject slot = slots.optJSONObject(i);
            int s = slot.optInt("s");
            int e = slot.optInt("e");
            String type = slot.optString("t");

            if (now >= s && now < e) {
                int duration = Math.max(1, e - s);
                st.progress = Math.min(100, Math.max(0, Math.round((now - s) * 100f / duration)));
                st.showProgress = true;
                st.title = "assembly".equals(type) ? "Morning assembly" : slot.optString("l");
                st.subtitle = slot.optString("ss") + " – " + slot.optString("es") + " · " + (e - now) + " min left";
                if ("period".equals(type)) {
                    fillRows(st, snap, cal, dayIdx, slots, i);
                } else {
                    int next = nextPeriodIndex(slots, i + 1);
                    if (next >= 0) {
                        fillRows(st, snap, cal, dayIdx, slots, next);
                        if (!st.rows.isEmpty()) st.note = "Up next: " + slots.optJSONObject(next).optString("l");
                    }
                }
                return st;
            }

            JSONObject nextSlot = i + 1 < slots.length() ? slots.optJSONObject(i + 1) : null;
            if (nextSlot != null && now >= e && now < nextSlot.optInt("s")) {
                int gap = nextSlot.optInt("s") - now;
                st.title = "Class transition";
                st.subtitle = nextSlot.optString("l") + " starts in " + gap + " min";
                int next = nextPeriodIndex(slots, i + 1);
                if (next >= 0) {
                    fillRows(st, snap, cal, dayIdx, slots, next);
                    if (!st.rows.isEmpty()) st.note = "Up next: " + slots.optJSONObject(next).optString("l");
                }
                return st;
            }
        }

        st.title = "School day over";
        return st;
    }

    private static int nextPeriodIndex(JSONArray slots, int from) {
        for (int i = from; i < slots.length(); i++) {
            if ("period".equals(slots.optJSONObject(i).optString("t"))) return i;
        }
        return -1;
    }

    /** Adds one row per class for the period stored in slots[slotIdx]. */
    private static void fillRows(Status st, JSONObject snap, Calendar cal, int dayIdx, JSONArray slots, int slotIdx) {
        JSONObject slot = slots.optJSONObject(slotIdx);
        if (slot == null || !"period".equals(slot.optString("t"))) return;
        int pi = slot.optInt("pi", -1);
        if (pi < 0) return;

        JSONObject alloc = snap.optJSONObject("alloc");
        JSONObject day = alloc == null ? null : alloc.optJSONObject(String.valueOf(dayIdx));
        JSONArray classes = day == null ? null : day.optJSONArray(String.valueOf(pi));
        if (classes == null) return;

        String key = String.format(Locale.US, "%04d-%02d-%02d",
                cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
        JSONObject dates = snap.optJSONObject("dates");
        JSONObject absent = dates == null ? null : dates.optJSONObject(key);

        for (int i = 0; i < classes.length(); i++) {
            JSONArray c = classes.optJSONArray(i);
            if (c == null) continue;
            String cls = c.optString(0);
            String subject = c.optString(1);
            String teacher = c.optString(2);
            String subject2 = c.optString(3);
            String teacher2 = c.optString(4);
            boolean free = c.optInt(5) == 1;

            Row r = new Row();
            r.cls = cls;
            if (free) {
                r.detail = "Free";
                r.color = COLOR_MUTED;
            } else {
                StringBuilder sb = new StringBuilder(subject);
                if (!teacher.isEmpty() && !"—".equals(teacher)) sb.append(" · ").append(teacher);
                r.color = COLOR_TEXT;
                JSONObject subs = absent == null ? null : absent.optJSONObject(teacher);
                if (subs != null) {
                    sb.append(" (absent)");
                    String sub = subs.optString(String.valueOf(pi), "");
                    if (!sub.isEmpty()) sb.append(" → ").append(sub);
                    r.color = COLOR_ABSENT;
                }
                if (!subject2.isEmpty() || !teacher2.isEmpty()) {
                    sb.append("  |  ").append(subject2);
                    if (!teacher2.isEmpty()) sb.append(" · ").append(teacher2);
                }
                r.detail = sb.toString();
            }
            st.rows.add(r);
        }
    }
}
