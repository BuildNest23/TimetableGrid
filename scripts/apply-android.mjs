// Copies the TimetableGrid widget + plugin into the generated Capacitor `android/` project.
// Safe to run any number of times. Run after `npx cap add android` / `npx cap sync android`.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const appId = 'com.timetablegrid.app';
const androidApp = path.join(root, 'android', 'app', 'src', 'main');

if (!fs.existsSync(androidApp)) {
  console.error('android/ not found. Run "npx cap add android" first.');
  process.exit(1);
}

// 1. Resources (widget layouts, drawables, strings, widget info)
fs.cpSync(path.join(root, 'android-res', 'res'), path.join(androidApp, 'res'), { recursive: true });

// 2. Java sources
const javaDir = path.join(androidApp, 'java', ...appId.split('.'));
fs.mkdirSync(javaDir, { recursive: true });
fs.copyFileSync(path.join(root, 'android-res', 'MainActivity.java'), path.join(javaDir, 'MainActivity.java'));
for (const f of fs.readdirSync(path.join(root, 'android-res', 'java'))) {
  const src = fs.readFileSync(path.join(root, 'android-res', 'java', f), 'utf8');
  fs.writeFileSync(path.join(javaDir, f), `package ${appId};\n\n${src.replace(/^package .*;\s*/m, '')}`);
}

// 3. AndroidManifest: register the widget receiver + list service (once)
const manifestPath = path.join(androidApp, 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('TimetableWidgetProvider')) {
  const block = `
        <receiver android:name=".TimetableWidgetProvider" android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/timetable_widget_info" />
        </receiver>

        <service
            android:name=".TimetableWidgetService"
            android:permission="android.permission.BIND_REMOTEVIEWS"
            android:exported="false" />
    `;
  manifest = manifest.replace('</application>', `${block}</application>`);
  fs.writeFileSync(manifestPath, manifest);
}

console.log('TimetableGrid widget applied to android/.');
