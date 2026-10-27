package ir.factoranbar.dashboard;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabsIntent;

public final class MainActivity extends AppCompatActivity {
    /*
     * Open the real dashboard on its production origin. Keeping dashboard execution in
     * the browser runtime preserves its existing service worker / Push API support,
     * Web notifications, file downloads, camera and location permissions better than
     * duplicating the web app inside an Android WebView.
     */
    private static final Uri DASHBOARD_URI =
            Uri.parse("https://server.factor-anbar.online/dashboard/dashboard.html");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openDashboard();
    }

    private void openDashboard() {
        try {
            CustomTabsIntent customTab = new CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .setUrlBarHidingEnabled(false)
                    .setToolbarColor(0xFF0F172A)
                    .setSecondaryToolbarColor(0xFF0F172A)
                    .setShareState(CustomTabsIntent.SHARE_STATE_ON)
                    .build();

            customTab.launchUrl(this, DASHBOARD_URI);
            finish();
        } catch (ActivityNotFoundException | IllegalArgumentException error) {
            // If a Custom Tabs provider is unavailable, use the user's default browser.
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, DASHBOARD_URI);
                startActivity(browserIntent);
                finish();
            } catch (ActivityNotFoundException noBrowser) {
                Toast.makeText(
                        this,
                        "مرورگری برای باز کردن داشبورد پیدا نشد.",
                        Toast.LENGTH_LONG
                ).show();
                finish();
            }
        }
    }
}
