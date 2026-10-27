package ir.factoranbar.dashboard;

import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONArray;
import org.json.JSONObject;
import org.osmdroid.config.Configuration;
import org.osmdroid.tileprovider.tilesource.TileSourceFactory;
import org.osmdroid.util.GeoPoint;
import org.osmdroid.views.MapView;
import org.osmdroid.views.overlay.Marker;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Rojin Dashboard is implemented with native Android Views and a native OSMDroid map.
 * It intentionally contains no WebView, Custom Tab, or browser-launch code.
 *
 * It connects to the existing dashboard API only; it does not replace the server,
 * write directly to the database, or change the separate Safir Rojin driver app.
 */
public final class MainActivity extends AppCompatActivity {
    private static final String SERVER = "https://server.factor-anbar.online";
    private static final String DASH_COMPANY = "rojin-dash";
    private static final String PREFS = "rojin_native_dashboard";
    private static final String COLOR_NAVY = "#0F172A";
    private static final String COLOR_BLUE = "#2563EB";
    private static final String COLOR_BG = "#F3F6FB";
    private static final String COLOR_CARD = "#FFFFFF";
    private static final String COLOR_TEXT = "#172033";
    private static final String COLOR_MUTED = "#667085";
    private static final String COLOR_GREEN = "#059669";
    private static final String COLOR_AMBER = "#D97706";
    private static final String COLOR_RED = "#DC2626";

    private final ExecutorService network = Executors.newFixedThreadPool(4);
    private SharedPreferences preferences;
    private String token = "";
    private String userName = "";
    private String userRole = "";
    private String selectedTab = "home";
    private boolean refreshing = false;

    private JSONObject dashboardData;
    private JSONObject loadsData;
    private JSONObject fleetData;
    private JSONObject driversData;

    private LinearLayout appRoot;
    private FrameLayout contentHost;
    private LinearLayout navigation;
    private TextView headerUser;
    private Button refreshButton;
    private MapView mapView;

    private Spinner userSpinner;
    private EditText passwordInput;
    private TextView loginError;
    private Button loginButton;
    private final List<String> loginUserNames = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        Configuration.getInstance().load(
                getApplicationContext(),
                getSharedPreferences("osmdroid", MODE_PRIVATE)
        );
        Configuration.getInstance().setUserAgentValue(getPackageName());

        token = preferences.getString("token", "");
        userName = preferences.getString("userName", "");
        userRole = preferences.getString("role", "");

        if (token.trim().isEmpty()) {
            showLoginScreen("");
        } else {
            showNativeShell();
            refreshAllData(false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mapView != null) mapView.onResume();
    }

    @Override
    protected void onPause() {
        if (mapView != null) mapView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        detachMap();
        network.shutdownNow();
        super.onDestroy();
    }

    // ---------------------------------------------------------------------
    // Authentication: native spinner, native password input, native button.
    // ---------------------------------------------------------------------

    private void showLoginScreen(String message) {
        detachMap();
        LinearLayout root = vertical(this);
        root.setBackgroundColor(Color.parseColor(COLOR_NAVY));
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(22), dp(24), dp(22), dp(24));

        ScrollView scroller = new ScrollView(this);
        scroller.setFillViewport(false);
        LinearLayout card = vertical(this);
        card.setPadding(dp(22), dp(25), dp(22), dp(24));
        card.setBackground(roundRect(COLOR_CARD, 22, "#243451", 1));
        scroller.addView(card, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView logo = text("▦", 42, color(COLOR_BLUE), true);
        logo.setGravity(Gravity.CENTER);
        card.addView(logo, matchWrap());
        TextView title = text("داشبورد مدیریتی روژین", 23, color(COLOR_TEXT), true);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(8), 0, dp(4));
        card.addView(title, matchWrap());
        TextView subtitle = text("ورود به برنامه بومی مدیریت ارسال، اسناد و ناوگان", 13,
                color(COLOR_MUTED), false);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 0, 0, dp(22));
        card.addView(subtitle, matchWrap());

        TextView userLabel = text("نام کاربری", 14, color(COLOR_TEXT), true);
        card.addView(userLabel, matchWrap());
        userSpinner = new Spinner(this);
        userSpinner.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        userSpinner.setBackground(roundRect("#F8FAFC", 10, "#D7DFEA", 1));
        LinearLayout.LayoutParams spinnerParams = marginParams(matchWrap(), 0, 6, 0, 14);
        card.addView(userSpinner, spinnerParams);

        TextView passwordLabel = text("رمز عبور", 14, color(COLOR_TEXT), true);
        card.addView(passwordLabel, matchWrap());
        passwordInput = new EditText(this);
        passwordInput.setSingleLine(true);
        passwordInput.setTextSize(16);
        passwordInput.setTextColor(color(COLOR_TEXT));
        passwordInput.setHintTextColor(color(COLOR_MUTED));
        passwordInput.setHint("رمز عبور حساب داشبورد");
        passwordInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        passwordInput.setImeOptions(EditorInfo.IME_ACTION_GO);
        passwordInput.setPadding(dp(12), dp(5), dp(12), dp(5));
        passwordInput.setBackground(roundRect("#F8FAFC", 10, "#D7DFEA", 1));
        card.addView(passwordInput, marginParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(52)), 0, 6, 0, 10));

        loginError = text(message == null ? "" : message, 13, color(COLOR_RED), false);
        loginError.setMinHeight(dp(22));
        card.addView(loginError, matchWrap());

        loginButton = actionButton("ورود به داشبورد", COLOR_BLUE);
        card.addView(loginButton, marginParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(50)), 0, 12, 0, 0));
        loginButton.setOnClickListener(v -> submitLogin());
        passwordInput.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) {
                submitLogin();
                return true;
            }
            return false;
        });

        TextView note = text("اتصال امن به سرور عملیاتی • بدون مرورگر داخلی", 11,
                color("#93A4C3"), false);
        note.setGravity(Gravity.CENTER);
        note.setPadding(0, dp(18), 0, 0);

        LinearLayout holder = vertical(this);
        holder.addView(scroller, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        holder.addView(note, matchWrap());
        root.addView(holder, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(root);

        if (message == null || message.isEmpty()) {
            loginError.setText("در حال دریافت کاربران...");
        }
        fetchLoginUsers();
    }

    private void fetchLoginUsers() {
        network.execute(() -> {
            try {
                JSONObject result = api("GET", "/api/auth/users?company=" + encode(DASH_COMPANY), null, "");
                JSONArray users = result.optJSONArray("users");
                List<String> names = new ArrayList<>();
                if (users != null) {
                    for (int i = 0; i < users.length(); i++) {
                        JSONObject item = users.optJSONObject(i);
                        if (item == null || item.optBoolean("active", true) == false) continue;
                        String name = item.optString("name", item.optString("userName", "")).trim();
                        if (!name.isEmpty()) names.add(name);
                    }
                }
                runOnUiThread(() -> {
                    loginUserNames.clear();
                    loginUserNames.addAll(names);
                    if (userSpinner != null) {
                        if (names.isEmpty()) {
                            names.add("کاربر فعالی پیدا نشد");
                        }
                        ArrayAdapter<String> adapter = new ArrayAdapter<>(
                                MainActivity.this,
                                android.R.layout.simple_spinner_item,
                                names
                        );
                        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
                        userSpinner.setAdapter(adapter);
                        if (loginUserNames.isEmpty()) {
                            loginError.setText("کاربر داشبورد پیدا نشد؛ اتصال سرور را بررسی کنید.");
                        } else {
                            loginError.setText("");
                        }
                    }
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    if (loginError != null) loginError.setText("اتصال به سرور ناموفق بود: " + friendlyError(e));
                });
            }
        });
    }

    private void submitLogin() {
        if (loginButton == null || userSpinner == null || passwordInput == null) return;
        Object selected = userSpinner.getSelectedItem();
        String username = selected == null ? "" : selected.toString().trim();
        String password = passwordInput.getText().toString();
        if (username.isEmpty() || username.equals("کاربر فعالی پیدا نشد") || password.isEmpty()) {
            loginError.setText("نام کاربری و رمز عبور را وارد کنید.");
            return;
        }

        loginButton.setEnabled(false);
        loginButton.setText("در حال ورود...");
        loginError.setText("");

        network.execute(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("userName", username);
                payload.put("password", password);
                JSONObject response = api("POST",
                        "/api/auth/login?company=" + encode(DASH_COMPANY), payload, "");
                if (!response.optBoolean("success", false) || response.optString("token", "").isEmpty()) {
                    throw new ApiException(401, response.optString("message", "ورود ناموفق بود."));
                }
                JSONObject user = response.optJSONObject("user");
                String role = user == null ? "" : user.optString("role", "");
                String actualName = user == null ? username : user.optString("name", username);
                if ("driver".equals(role)) {
                    throw new ApiException(403,
                            "این برنامه مخصوص داشبورد مدیریتی است؛ پرتال راننده همان برنامه سفیر روژین است.");
                }
                String returnedToken = response.optString("token");
                runOnUiThread(() -> {
                    token = returnedToken;
                    userName = actualName;
                    userRole = role;
                    preferences.edit()
                            .putString("token", token)
                            .putString("userName", userName)
                            .putString("role", userRole)
                            .apply();
                    passwordInput.setText("");
                    showNativeShell();
                    refreshAllData(false);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    if (loginButton != null) {
                        loginButton.setEnabled(true);
                        loginButton.setText("ورود به داشبورد");
                    }
                    if (loginError != null) loginError.setText(friendlyError(e));
                });
            }
        });
    }

    // ---------------------------------------------------------------------
    // Native app shell / navigation.
    // ---------------------------------------------------------------------

    private void showNativeShell() {
        detachMap();
        appRoot = vertical(this);
        appRoot.setBackgroundColor(color(COLOR_BG));

        LinearLayout header = horizontal(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(14), dp(10), dp(14), dp(10));
        header.setBackgroundColor(color(COLOR_NAVY));

        LinearLayout branding = vertical(this);
        TextView title = text("داشبورد روژین", 19, Color.WHITE, true);
        TextView subtitle = text("مدیریت ارسال و ناوگان", 11, color("#CBD5E1"), false);
        branding.addView(title, matchWrap());
        branding.addView(subtitle, matchWrap());
        header.addView(branding, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        LinearLayout headButtons = horizontal(this);
        refreshButton = actionButton("↻", COLOR_BLUE);
        refreshButton.setTextSize(19);
        refreshButton.setContentDescription("تازه‌سازی اطلاعات");
        refreshButton.setMinWidth(dp(44));
        refreshButton.setPadding(dp(8), 0, dp(8), 0);
        refreshButton.setOnClickListener(v -> refreshAllData(true));
        Button logout = actionButton("خروج", "#334155");
        logout.setTextSize(12);
        logout.setPadding(dp(9), 0, dp(9), 0);
        logout.setOnClickListener(v -> logout());
        headButtons.addView(refreshButton, marginParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(42)), 0, 0, 6, 0));
        headButtons.addView(logout, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(42)));
        header.addView(headButtons);

        headerUser = text(userName + (userRole.isEmpty() ? "" : " • " + roleFa(userRole)),
                11, color("#DBEAFE"), false);
        headerUser.setPadding(dp(14), dp(8), dp(14), dp(8));
        headerUser.setBackgroundColor(color("#18263D"));

        navigation = horizontal(this);
        navigation.setPadding(dp(5), dp(6), dp(5), dp(6));
        navigation.setBackgroundColor(Color.WHITE);
        navigation.setElevation(dp(2));

        contentHost = new FrameLayout(this);
        contentHost.setBackgroundColor(color(COLOR_BG));

        appRoot.addView(header, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        appRoot.addView(headerUser, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        appRoot.addView(navigation, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(58)));
        appRoot.addView(contentHost, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(appRoot);
        makeNavigationButtons();
        renderCurrentTab();
    }

    private void makeNavigationButtons() {
        navigation.removeAllViews();
        addNavigationButton("home", "▦\nخلاصه");
        addNavigationButton("dispatch", "⇢\nارسال‌ها");
        addNavigationButton("fleet", "🚚\nناوگان");
        addNavigationButton("map", "⌖\nنقشه");
        addNavigationButton("documents", "▤\nاسناد");
        updateNavigationStyle();
    }

    private void addNavigationButton(String key, String label) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(label);
        b.setTextSize(10);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(2), 0, dp(2), 0);
        b.setMinHeight(dp(48));
        b.setMinimumHeight(dp(48));
        b.setBackground(roundRect(selectedTab.equals(key) ? "#E6EEFF" : "#FFFFFF", 10,
                selectedTab.equals(key) ? "#B9CCFF" : "#FFFFFF", 1));
        b.setTextColor(selectedTab.equals(key) ? color(COLOR_BLUE) : color(COLOR_MUTED));
        b.setOnClickListener(v -> {
            selectedTab = key;
            updateNavigationStyle();
            renderCurrentTab();
            if (needsRefreshForTab(key)) refreshAllData(false);
        });
        navigation.addView(b, new LinearLayout.LayoutParams(0, dp(48), 1f));
    }

    private boolean needsRefreshForTab(String tab) {
        return ("home".equals(tab) && dashboardData == null)
                || ("dispatch".equals(tab) && loadsData == null)
                || ("fleet".equals(tab) && fleetData == null)
                || ("map".equals(tab) && fleetData == null)
                || ("documents".equals(tab) && dashboardData == null);
    }

    private void updateNavigationStyle() {
        if (navigation == null) return;
        makeNavigationButtonsWithoutLoop();
    }

    private void makeNavigationButtonsWithoutLoop() {
        // Recreate only the five small native navigation buttons, not the screen content.
        navigation.removeAllViews();
        addNavigationButton("home", "▦\nخلاصه");
        addNavigationButton("dispatch", "⇢\nارسال‌ها");
        addNavigationButton("fleet", "🚚\nناوگان");
        addNavigationButton("map", "⌖\nنقشه");
        addNavigationButton("documents", "▤\nاسناد");
    }

    private void logout() {
        token = "";
        userName = "";
        userRole = "";
        dashboardData = null;
        loadsData = null;
        fleetData = null;
        driversData = null;
        preferences.edit().clear().apply();
        showLoginScreen("از حساب خارج شدید.");
    }

    private void refreshAllData(boolean notify) {
        if (refreshing || token.isEmpty()) return;
        refreshing = true;
        if (refreshButton != null) {
            refreshButton.setEnabled(false);
            refreshButton.setText("…");
        }

        network.execute(() -> {
            Exception authFailure = null;
            boolean anySuccess = false;
            try {
                dashboardData = api("GET", "/api/dashboard-data?t=" + System.currentTimeMillis(), null, token);
                anySuccess = true;
            } catch (Exception e) {
                if (isAuthError(e)) authFailure = e;
            }
            try {
                loadsData = api("GET", "/api/dashboard-loads?t=" + System.currentTimeMillis(), null, token);
                anySuccess = true;
            } catch (Exception e) {
                if (isAuthError(e)) authFailure = e;
            }
            try {
                fleetData = api("GET", "/api/dashboard-fleet/control-center", null, token);
                anySuccess = true;
            } catch (Exception e) {
                if (isAuthError(e)) authFailure = e;
            }
            try {
                driversData = api("GET", "/api/dashboard-fleet/drivers", null, token);
                anySuccess = true;
            } catch (Exception e) {
                // The fleet panel reports this endpoint error only when the user opens fleet.
            }

            final boolean succeeded = anySuccess;
            final Exception auth = authFailure;
            runOnUiThread(() -> {
                refreshing = false;
                if (refreshButton != null) {
                    refreshButton.setEnabled(true);
                    refreshButton.setText("↻");
                }
                if (auth != null && !succeeded) {
                    preferences.edit().clear().apply();
                    token = "";
                    userName = "";
                    userRole = "";
                    showLoginScreen("نشست معتبر نیست یا منقضی شده؛ دوباره وارد شوید.");
                    return;
                }
                renderCurrentTab();
                if (notify) {
                    Toast.makeText(MainActivity.this,
                            succeeded ? "اطلاعات از سرور به‌روز شد." : "دریافت اطلاعات ناموفق بود؛ اتصال سرور را بررسی کنید.",
                            Toast.LENGTH_SHORT).show();
                }
            });
        });
    }

    private void renderCurrentTab() {
        if (contentHost == null) return;
        detachMap();
        contentHost.removeAllViews();
        View page;
        switch (selectedTab) {
            case "dispatch": page = buildDispatchPage(); break;
            case "fleet": page = buildFleetPage(); break;
            case "map": page = buildMapPage(); break;
            case "documents": page = buildDocumentsPage(); break;
            default: page = buildHomePage(); break;
        }
        if (page.getParent() != null) ((ViewGroup) page.getParent()).removeView(page);
        contentHost.addView(page, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    // ---------------------------------------------------------------------
    // Overview page.
    // ---------------------------------------------------------------------

    private View buildHomePage() {
        LinearLayout body = pageColumn();
        LinearLayout intro = card(body);
        addText(intro, "نمای کلی عملیات", 19, COLOR_TEXT, true);
        addText(intro, "اطلاعات این صفحه مستقیماً از API فعلی سرور دریافت می‌شود.", 12, COLOR_MUTED, false);
        if (dashboardData == null && fleetData == null) {
            addLoading(body, "در حال دریافت اطلاعات داشبورد...");
            return scroll(body);
        }

        JSONObject summary = fleetData == null ? null : fleetData.optJSONObject("missionSummary");
        LinearLayout row1 = horizontal(this);
        row1.setGravity(Gravity.CENTER_VERTICAL);
        row1.addView(kpiCard("آماده ارسال", number(summary, "readyCount"), COLOR_BLUE),
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        addGap(row1, 8);
        row1.addView(kpiCard("در مسیر", number(summary, "activeCount"), COLOR_GREEN),
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        body.addView(row1, matchWrap());

        LinearLayout row2 = horizontal(this);
        row2.setGravity(Gravity.CENTER_VERTICAL);
        row2.addView(kpiCard("تکمیل‌شده", number(summary, "completedCount"), "#0D9488"),
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        addGap(row2, 8);
        row2.addView(kpiCard("نیازمند رسیدگی", number(summary, "needsAttentionCount"), COLOR_RED),
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        body.addView(row2, marginParams(matchWrap(), 0, 8, 0, 12));

        JSONArray invoices = dashboardData == null ? null : dashboardData.optJSONArray("invoices");
        JSONArray customers = dashboardData == null ? null : dashboardData.optJSONArray("customers");
        LinearLayout stats = card(body);
        addText(stats, "وضعیت داده‌ها", 16, COLOR_TEXT, true);
        addPair(stats, "تعداد فاکتورها", invoices == null ? "—" : fmt(invoices.length()));
        addPair(stats, "تعداد مشتریان", customers == null ? "—" : fmt(customers.length()));
        addPair(stats, "آخرین به‌روزرسانی", dashboardData == null ? "—" :
                dashboardData.optString("updatedAt", dashboardData.optString("source", "سرور محلی")));
        addPair(stats, "کاربر واردشده", userName);

        LinearLayout vehicles = card(body);
        addText(vehicles, "خلاصه وضعیت خودروها", 16, COLOR_TEXT, true);
        JSONArray vehicleRows = fleetData == null ? null : fleetData.optJSONArray("vehiclesStatus");
        if (vehicleRows == null || vehicleRows.length() == 0) {
            addText(vehicles, "اطلاعات وضعیت خودرو در دسترس نیست.", 13, COLOR_MUTED, false);
        } else {
            for (int i = 0; i < Math.min(vehicleRows.length(), 4); i++) {
                JSONObject vehicle = vehicleRows.optJSONObject(i);
                if (vehicle != null) addVehicleCompact(vehicles, vehicle);
            }
            Button more = actionButton("مشاهده ناوگان", COLOR_BLUE);
            more.setOnClickListener(v -> navigate("fleet"));
            vehicles.addView(more, marginParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, dp(44)), 0, 6, 0, 0));
        }

        LinearLayout alerts = card(body);
        addText(alerts, "هشدارهای عملیاتی", 16, COLOR_TEXT, true);
        int problemCount = fleetData == null ? 0 : fleetData.optInt("problemStopsCount", 0);
        int exceptionCount = fleetData == null ? 0 : fleetData.optInt("openExceptionsCount", 0);
        int syncCount = fleetData == null ? 0 : fleetData.optInt("syncIssuesCount", 0);
        addPair(alerts, "توقف‌های مشکل‌دار", fmt(problemCount));
        addPair(alerts, "استثناهای باز", fmt(exceptionCount));
        addPair(alerts, "خطاهای همگام‌سازی رانندگان", fmt(syncCount));
        if (loadsData != null) addPair(alerts, "اسناد بارگیری محاسبه‌شده", fmt(loadsData.optInt("docs", 0)));
        return scroll(body);
    }

    // ---------------------------------------------------------------------
    // Native dispatch / loads listing.
    // ---------------------------------------------------------------------

    private View buildDispatchPage() {
        LinearLayout body = pageColumn();
        LinearLayout heading = card(body);
        addText(heading, "برنامه ارسال و بارها", 19, COLOR_TEXT, true);
        addText(heading, "فهرست بارها از اسناد خروج واقعی انبار محاسبه می‌شود؛ وزن نامشخص حدس زده نمی‌شود.", 12, COLOR_MUTED, false);

        if (loadsData == null) {
            addLoading(body, "در حال دریافت بارها...");
            return scroll(body);
        }
        JSONObject loads = loadsData.optJSONObject("loads");
        List<JSONObject> all = flattenLoads(loads);
        JSONArray missing = loadsData.optJSONArray("missingProducts");
        LinearLayout summary = card(body);
        addPair(summary, "تعداد اسناد خروج متصل به بار", fmt(loadsData.optInt("docs", all.size())));
        addPair(summary, "قلم‌های فاقد وزن", fmt(missing == null ? 0 : missing.length()));
        addPair(summary, "زمان سرور", loadsData.optString("serverTime", "—"));

        EditText search = input("جستجو با شماره فاکتور، مشتری یا شرکت");
        body.addView(search, marginParams(matchWrap(), 0, 4, 0, 8));
        LinearLayout listHost = vertical(this);
        body.addView(listHost, matchWrap());
        renderLoadsList(listHost, all, "");
        Button find = actionButton("جستجو", COLOR_BLUE);
        find.setOnClickListener(v -> renderLoadsList(listHost, all, search.getText().toString().trim()));
        body.addView(find, marginParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(44)), 0, 8, 0, 14));
        return scroll(body);
    }

    private List<JSONObject> flattenLoads(JSONObject loads) {
        List<JSONObject> result = new ArrayList<>();
        if (loads == null) return result;
        Iterator<String> keys = loads.keys();
        while (keys.hasNext()) {
            String number = keys.next();
            JSONArray entries = loads.optJSONArray(number);
            if (entries == null) continue;
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (entry == null) continue;
                try {
                    JSONObject clone = new JSONObject(entry.toString());
                    if (clone.optString("number", "").isEmpty()) clone.put("number", number);
                    result.add(clone);
                } catch (Exception ignored) {}
            }
        }
        return result;
    }

    private void renderLoadsList(LinearLayout host, List<JSONObject> items, String query) {
        host.removeAllViews();
        String q = normalize(query);
        int shown = 0;
        for (JSONObject item : items) {
            String number = item.optString("number", "");
            String party = item.optString("party", "");
            String company = companyFa(item.optString("company", ""));
            String haystack = normalize(number + " " + party + " " + company + " " + item.optString("date", ""));
            if (!q.isEmpty() && !haystack.contains(q)) continue;
            if (shown >= 160) break;
            shown++;
            LinearLayout c = card(host);
            addText(c, "فاکتور " + emptyDash(number), 16, COLOR_TEXT, true);
            addText(c, emptyDash(party), 14, COLOR_BLUE, true);
            addPair(c, "شرکت", company);
            addPair(c, "تاریخ", emptyDash(item.optString("date", "")));
            addPair(c, "وزن دقیق", numberKg(item.optDouble("kg", 0)) + " کیلو");
            addPair(c, "کارتن / تکه", fmt(item.optDouble("cartons", 0)) + " / " + fmt(item.optDouble("pieces", 0)));
            int unknown = item.optInt("unknownLines", 0);
            String status = item.optString("weightStatus", "");
            if (unknown > 0 || "partial".equals(status) || "unknown".equals(status)) {
                addStatus(c, "نیازمند بررسی وزن • " + fmt(unknown) + " قلم", COLOR_AMBER);
                JSONArray codes = item.optJSONArray("missingCodes");
                if (codes != null && codes.length() > 0) {
                    addText(c, "کدهای فاقد وزن: " + jsonArrayJoined(codes), 11, COLOR_AMBER, false);
                }
            } else {
                addStatus(c, "وزن تأییدشده", COLOR_GREEN);
            }
        }
        addText(host, shown == 0 ? "موردی با این جستجو پیدا نشد." :
                "نمایش " + fmt(shown) + " مورد از " + fmt(items.size()), 12, COLOR_MUTED, false);
    }

    // ---------------------------------------------------------------------
    // Native fleet summary: live operational KPIs, vehicle status and drivers.
    // ---------------------------------------------------------------------

    private View buildFleetPage() {
        LinearLayout body = pageColumn();
        LinearLayout heading = card(body);
        addText(heading, "ناوگان و رانندگان", 19, COLOR_TEXT, true);
        addText(heading, "وضعیت سفر، آمادگی بارگیری، ظرفیت و زمان آخرین موقعیت دریافتی از سرور.", 12, COLOR_MUTED, false);
        if (fleetData == null) {
            addLoading(body, "در حال دریافت وضعیت ناوگان...");
            return scroll(body);
        }

        JSONObject summary = fleetData.optJSONObject("missionSummary");
        LinearLayout row1 = horizontal(this);
        row1.addView(kpiCard("آماده", number(summary, "readyCount"), COLOR_BLUE),
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        addGap(row1, 6);
        row1.addView(kpiCard("در مسیر", number(summary, "activeCount"), COLOR_GREEN),
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        body.addView(row1, matchWrap());

        JSONArray vehicles = fleetData.optJSONArray("vehiclesStatus");
        LinearLayout vehicleSection = card(body);
        addText(vehicleSection, "وضعیت خودروها", 16, COLOR_TEXT, true);
        if (vehicles == null || vehicles.length() == 0) {
            addText(vehicleSection, "سرور فهرست خودروها را برنگرداند.", 13, COLOR_MUTED, false);
        } else {
            for (int i = 0; i < vehicles.length(); i++) {
                JSONObject v = vehicles.optJSONObject(i);
                if (v != null) addVehicleCompact(vehicleSection, v);
            }
        }

        LinearLayout driverSection = card(body);
        addText(driverSection, "فهرست رانندگان", 16, COLOR_TEXT, true);
        JSONArray drivers = driversData == null ? null : driversData.optJSONArray("drivers");
        if (drivers == null || drivers.length() == 0) {
            addText(driverSection, "فهرست رانندگان در دسترس نیست.", 13, COLOR_MUTED, false);
        } else {
            for (int i = 0; i < drivers.length(); i++) {
                JSONObject d = drivers.optJSONObject(i);
                if (d == null) continue;
                String name = d.optString("name", d.optString("userName", "راننده"));
                String vehicle = d.optString("vehicleLabel", d.optString("vehicle", ""));
                String status = d.optBoolean("active", true) ? "فعال" : "غیرفعال";
                LinearLayout row = card(driverSection);
                addText(row, name, 14, COLOR_TEXT, true);
                addPair(row, "خودرو", emptyDash(vehicle));
                addPair(row, "وضعیت حساب", status);
                addPair(row, "شناسه", emptyDash(d.optString("id", "")));
            }
        }

        Button mapButton = actionButton("نمایش موقعیت خودروها روی نقشه", COLOR_BLUE);
        mapButton.setOnClickListener(v -> navigate("map"));
        body.addView(mapButton, marginParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(46)), 0, 8, 0, 0));
        return scroll(body);
    }

    private void addVehicleCompact(LinearLayout parent, JSONObject vehicle) {
        LinearLayout vCard = card(parent);
        String label = vehicle.optString("vehicleLabel", vehicle.optString("vehicleKey", "خودرو"));
        addText(vCard, "🚚 " + label, 15, COLOR_TEXT, true);
        addPair(vCard, "راننده", emptyDash(vehicle.optString("driverName", "")));
        addPair(vCard, "وضعیت سفر", tripStatusFa(vehicle.optString("tripStatus", "")));
        JSONObject stops = vehicle.optJSONObject("stopCounts");
        if (stops != null) addPair(vCard, "توقف‌ها", fmt(stops.optInt("delivered", 0)) + " تحویل / " +
                fmt(stops.optInt("open", 0)) + " باز / " + fmt(stops.optInt("failed", 0)) + " ناموفق");

        JSONObject metrics = vehicle.optJSONObject("loadMetrics");
        if (metrics != null) {
            double kg = metrics.optDouble("totalKg", 0);
            double cap = metrics.optDouble("capacityKg", 0);
            addPair(vCard, "بار / ظرفیت", numberKg(kg) + " / " + numberKg(cap) + " کیلو");
            if (metrics.optBoolean("isOverloaded", false) || metrics.optInt("unknownWeightStops", 0) > 0) {
                addStatus(vCard, metrics.optBoolean("isOverloaded", false)
                        ? "هشدار اضافه‌بار" : "وزن بخشی از بار نامشخص است", COLOR_RED);
            }
        }
        JSONObject loc = vehicle.optJSONObject("location");
        if (loc != null && !loc.isNull("lat") && !loc.isNull("lng")) {
            addPair(vCard, "موقعیت", numberCoordinate(loc.optDouble("lat", 0)) + ", " +
                    numberCoordinate(loc.optDouble("lng", 0)));
            addPair(vCard, "وضعیت GPS", emptyDash(loc.optString("label",
                    loc.optString("freshnessState", ""))));
            addPair(vCard, "سرعت", numberKg(loc.optDouble("speed", 0)) + " km/h");
        } else {
            addPair(vCard, "موقعیت", "هنوز ثبت نشده");
        }
        JSONObject conn = vehicle.optJSONObject("connectivity");
        if (conn != null) addStatus(vCard, onlineFa(conn.optString("onlineState", "")),
                "online".equals(conn.optString("onlineState", "")) ? COLOR_GREEN : COLOR_AMBER);
        JSONArray alerts = vehicle.optJSONArray("activeAlerts");
        if (alerts != null && alerts.length() > 0) {
            addStatus(vCard, "هشدار فعال: " + fmt(alerts.length()), COLOR_RED);
        }
    }

    // ---------------------------------------------------------------------
    // Native map. This uses an Android MapView, not a web map or WebView.
    // ---------------------------------------------------------------------

    private View buildMapPage() {
        LinearLayout root = vertical(this);
        root.setPadding(dp(10), dp(10), dp(10), dp(10));
        LinearLayout titleCard = card(root);
        addText(titleCard, "نقشه زنده ناوگان", 18, COLOR_TEXT, true);
        addText(titleCard, "نشانگرها از آخرین مختصات گزارش‌شده رانندگان دریافت می‌شوند؛ موقعیت تازه به معنی GPS لحظه‌ای تضمین‌شده نیست.",
                11, COLOR_MUTED, false);

        if (fleetData == null) {
            addLoading(root, "در حال دریافت موقعیت خودروها...");
            return root;
        }

        mapView = new MapView(this);
        mapView.setTileSource(TileSourceFactory.MAPNIK);
        mapView.setMultiTouchControls(true);
        mapView.setTilesScaledToDpi(true);
        mapView.setUseDataConnection(true);
        LinearLayout.LayoutParams mapParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        mapParams.topMargin = dp(5);
        mapParams.bottomMargin = dp(8);
        root.addView(mapView, mapParams);

        JSONArray vehicles = fleetData.optJSONArray("vehiclesStatus");
        List<GeoPoint> points = new ArrayList<>();
        if (vehicles != null) {
            for (int i = 0; i < vehicles.length(); i++) {
                JSONObject vehicle = vehicles.optJSONObject(i);
                if (vehicle == null) continue;
                JSONObject loc = vehicle.optJSONObject("location");
                if (loc == null || loc.isNull("lat") || loc.isNull("lng")) continue;
                double lat = loc.optDouble("lat", Double.NaN);
                double lon = loc.optDouble("lng", Double.NaN);
                if (Double.isNaN(lat) || Double.isInfinite(lat) || Double.isNaN(lon) || Double.isInfinite(lon) ||
                        lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
                GeoPoint point = new GeoPoint(lat, lon);
                points.add(point);
                Marker marker = new Marker(mapView);
                marker.setPosition(point);
                marker.setTitle(vehicle.optString("vehicleLabel", "خودرو"));
                marker.setSnippet("راننده: " + vehicle.optString("driverName", "تعیین‌نشده") +
                        "\nوضعیت: " + tripStatusFa(vehicle.optString("tripStatus", "")) +
                        "\nGPS: " + loc.optString("label", loc.optString("freshnessState", "نامشخص")));
                marker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM);
                mapView.getOverlays().add(marker);
            }
        }

        if (points.isEmpty()) {
            mapView.getController().setZoom(4.5);
            mapView.getController().setCenter(new GeoPoint(32.0, 53.0));
            TextView empty = text("مختصات ثبت‌شده‌ای برای نمایش دریافت نشد.", 12, COLOR_AMBER, true);
            empty.setGravity(Gravity.CENTER);
            root.addView(empty, matchWrap());
        } else {
            double latSum = 0, lonSum = 0;
            for (GeoPoint p : points) { latSum += p.getLatitude(); lonSum += p.getLongitude(); }
            mapView.getController().setZoom(points.size() == 1 ? 12.0 : 6.0);
            mapView.getController().setCenter(new GeoPoint(latSum / points.size(), lonSum / points.size()));
            TextView count = text("تعداد خودروهای دارای مختصات: " + fmt(points.size()), 12,
                    COLOR_GREEN, true);
            count.setGravity(Gravity.CENTER);
            root.addView(count, matchWrap());
        }
        mapView.invalidate();
        return root;
    }

    // ---------------------------------------------------------------------
    // Native documents list.
    // ---------------------------------------------------------------------

    private View buildDocumentsPage() {
        LinearLayout body = pageColumn();
        LinearLayout heading = card(body);
        addText(heading, "اسناد و فاکتورها", 19, COLOR_TEXT, true);
        addText(heading, "این فهرست، اطلاعات خواندنی داشبورد را از سرور دریافت می‌کند؛ در این نسخه اسناد واقعی تغییر داده نمی‌شوند.",
                12, COLOR_MUTED, false);
        if (dashboardData == null) {
            addLoading(body, "در حال دریافت اسناد...");
            return scroll(body);
        }
        JSONArray invoices = dashboardData.optJSONArray("invoices");
        if (invoices == null) invoices = new JSONArray();
        final JSONArray source = invoices;
        EditText search = input("شماره، مشتری، تاریخ یا نام شیت");
        body.addView(search, marginParams(matchWrap(), 0, 3, 0, 8));
        LinearLayout buttons = horizontal(this);
        Button find = actionButton("جستجو", COLOR_BLUE);
        Button clear = actionButton("پاک‌کردن", "#475569");
        buttons.addView(find, new LinearLayout.LayoutParams(0, dp(44), 1f));
        addGap(buttons, 8);
        buttons.addView(clear, new LinearLayout.LayoutParams(0, dp(44), 1f));
        body.addView(buttons, marginParams(matchWrap(), 0, 0, 0, 8));
        LinearLayout listHost = vertical(this);
        body.addView(listHost, matchWrap());
        renderInvoicesList(listHost, source, "");
        find.setOnClickListener(v -> renderInvoicesList(listHost, source, search.getText().toString().trim()));
        clear.setOnClickListener(v -> {
            search.setText("");
            renderInvoicesList(listHost, source, "");
        });
        return scroll(body);
    }

    private void renderInvoicesList(LinearLayout host, JSONArray invoices, String query) {
        host.removeAllViews();
        String q = normalize(query);
        int shown = 0;
        int total = invoices == null ? 0 : invoices.length();
        for (int i = 0; invoices != null && i < invoices.length(); i++) {
            JSONObject inv = invoices.optJSONObject(i);
            if (inv == null) continue;
            String number = inv.optString("number", "");
            String party = inv.optString("party", "");
            String sheet = inv.optString("sheet", "");
            String haystack = normalize(number + " " + party + " " + sheet + " " +
                    inv.optString("date", "") + " " + inv.optString("expectedDate", ""));
            if (!q.isEmpty() && !haystack.contains(q)) continue;
            if (shown >= 180) break;
            shown++;
            LinearLayout c = card(host);
            addText(c, "فاکتور " + emptyDash(number), 16, COLOR_TEXT, true);
            addText(c, emptyDash(party), 14, COLOR_BLUE, true);
            addPair(c, "شرکت / شیت", emptyDash(sheet));
            addPair(c, "تاریخ سند", emptyDash(inv.optString("date", "")));
            addPair(c, "موعد ارسال", emptyDash(inv.optString("expectedDate", "")));
            addPair(c, "وضعیت", emptyDash(inv.optString("statusRaw", "ثبت‌شده")));
            addPair(c, "رسید فیزیکی", inv.optBoolean("hasPhysicalFile", false) ? "دارد" : "ثبت نشده");
            String description = inv.optString("description", "");
            if (!description.isEmpty()) addText(c, description, 11, COLOR_MUTED, false);
        }
        addText(host, shown == 0 ? "فاکتوری با این مشخصات پیدا نشد." :
                "نمایش " + fmt(shown) + " مورد از " + fmt(total), 12, COLOR_MUTED, false);
    }

    // ---------------------------------------------------------------------
    // API transport: no WebView/browser. The app talks to the existing HTTPS API.
    // ---------------------------------------------------------------------

    private JSONObject api(String method, String path, JSONObject body, String bearer) throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(SERVER + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(25000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            if (bearer != null && !bearer.trim().isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + bearer.trim());
            }
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                }
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 400
                    ? connection.getInputStream() : connection.getErrorStream();
            String response = readText(stream);
            JSONObject json;
            try {
                json = new JSONObject(response == null || response.isEmpty() ? "{}" : response);
            } catch (Exception parseError) {
                throw new ApiException(status, "پاسخ سرور قابل خواندن نیست (HTTP " + status + ").");
            }
            if (status < 200 || status >= 300) {
                throw new ApiException(status, json.optString("message",
                        json.optString("error", "خطای سرور: HTTP " + status)));
            }
            if (!json.optBoolean("success", true)) {
                throw new ApiException(status, json.optString("message",
                        json.optString("error", "عملیات ناموفق بود.")));
            }
            return json;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readText(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) out.append(line);
        }
        return out.toString();
    }

    private boolean isAuthError(Exception e) {
        return e instanceof ApiException &&
                (((ApiException) e).status == 401 || ((ApiException) e).status == 403);
    }

    private String friendlyError(Exception e) {
        if (e instanceof ApiException) return ((ApiException) e).message;
        String msg = e == null ? "" : e.getMessage();
        if (msg == null || msg.trim().isEmpty()) return "خطای ناشناخته در ارتباط با سرور.";
        return "ارتباط با سرور: " + msg;
    }

    private static final class ApiException extends Exception {
        final int status;
        final String message;
        ApiException(int status, String message) {
            super(message);
            this.status = status;
            this.message = message == null ? "خطای سرور." : message;
        }
    }

    // ---------------------------------------------------------------------
    // Native visual components and utility functions.
    // ---------------------------------------------------------------------

    private void navigate(String tab) {
        selectedTab = tab;
        updateNavigationStyle();
        renderCurrentTab();
        if (needsRefreshForTab(tab)) refreshAllData(false);
    }

    private LinearLayout pageColumn() {
        LinearLayout col = vertical(this);
        col.setPadding(dp(12), dp(12), dp(12), dp(20));
        col.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        return col;
    }

    private LinearLayout vertical(Context ctx) {
        LinearLayout v = new LinearLayout(ctx);
        v.setOrientation(LinearLayout.VERTICAL);
        v.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        return v;
    }

    private LinearLayout horizontal(Context ctx) {
        LinearLayout v = new LinearLayout(ctx);
        v.setOrientation(LinearLayout.HORIZONTAL);
        v.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        return v;
    }

    private ScrollView scroll(View view) {
        ScrollView s = new ScrollView(this);
        s.setFillViewport(true);
        s.setClipToPadding(false);
        s.addView(view, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return s;
    }

    private LinearLayout card(LinearLayout parent) {
        LinearLayout c = vertical(this);
        c.setPadding(dp(13), dp(12), dp(13), dp(12));
        c.setBackground(roundRect(COLOR_CARD, 15, "#E2E8F0", 1));
        c.setElevation(dp(1));
        LinearLayout.LayoutParams p = marginParams(matchWrap(), 0, 0, 0, 10);
        parent.addView(c, p);
        return c;
    }

    private LinearLayout kpiCard(String title, String value, String accent) {
        LinearLayout c = vertical(this);
        c.setPadding(dp(12), dp(12), dp(12), dp(13));
        c.setBackground(roundRect(COLOR_CARD, 14, accent, 1));
        TextView t = text(title, 11, color(COLOR_MUTED), true);
        TextView v = text(value, 24, color(accent), true);
        c.addView(t, matchWrap());
        c.addView(v, marginParams(matchWrap(), 0, 5, 0, 0));
        return c;
    }

    private void addText(LinearLayout parent, String value, int size, int color, boolean bold) {
        TextView t = text(value, size, color(color), bold);
        parent.addView(t, marginParams(matchWrap(), 0, 2, 0, 4));
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value == null ? "" : value);
        t.setTextSize(size);
        t.setTextColor(color);
        t.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
        t.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        t.setTextDirection(View.TEXT_DIRECTION_FIRST_STRONG_RTL);
        t.setLineSpacing(dp(2), 1.0f);
        return t;
    }

    private void addPair(LinearLayout parent, String label, String value) {
        LinearLayout row = horizontal(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView l = text(label, 12, color(COLOR_MUTED), false);
        TextView v = text(value == null ? "—" : value, 12, color(COLOR_TEXT), true);
        l.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        v.setGravity(Gravity.LEFT | Gravity.CENTER_VERTICAL);
        row.addView(l, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(v, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        parent.addView(row, marginParams(matchWrap(), 0, 4, 0, 4));
    }

    private void addStatus(LinearLayout parent, String value, int backgroundColor) {
        TextView t = text("● " + value, 11, backgroundColor, true);
        t.setPadding(dp(10), dp(6), dp(10), dp(6));
        t.setBackground(roundRect("#F8FAFC", 9, toHex(backgroundColor), 1));
        parent.addView(t, marginParams(matchWrap(), 0, 5, 0, 3));
    }

    private void addLoading(LinearLayout parent, String message) {
        LinearLayout c = card(parent);
        ProgressBar bar = new ProgressBar(this);
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(dp(38), dp(38));
        bp.gravity = Gravity.CENTER_HORIZONTAL;
        c.addView(bar, bp);
        TextView t = text(message, 13, color(COLOR_MUTED), false);
        t.setGravity(Gravity.CENTER);
        c.addView(t, marginParams(matchWrap(), 0, 8, 0, 0));
    }

    private Button actionButton(String label, String background) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(label);
        b.setTextSize(13);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextColor(Color.WHITE);
        b.setPadding(dp(10), 0, dp(10), 0);
        b.setBackground(roundRect(background, 10, background, 1));
        return b;
    }

    private EditText input(String hint) {
        EditText e = new EditText(this);
        e.setSingleLine(true);
        e.setTextSize(13);
        e.setTextColor(color(COLOR_TEXT));
        e.setHintTextColor(color(COLOR_MUTED));
        e.setHint(hint);
        e.setPadding(dp(12), dp(4), dp(12), dp(4));
        e.setBackground(roundRect(COLOR_CARD, 10, "#D7DFEA", 1));
        return e;
    }

    private GradientDrawable roundRect(String fill, int radiusDp, String stroke, int strokeDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color(fill));
        d.setCornerRadius(dp(radiusDp));
        if (stroke != null) d.setStroke(dp(strokeDp), color(stroke));
        return d;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams marginParams(LinearLayout.LayoutParams p,
                                                   int left, int top, int right, int bottom) {
        p.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return p;
    }

    private void addGap(LinearLayout parent, int widthDp) {
        View gap = new View(this);
        parent.addView(gap, new LinearLayout.LayoutParams(dp(widthDp), dp(1)));
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int color(String value) {
        return value.startsWith("#") ? Color.parseColor(value) : Color.BLACK;
    }

    private String toHex(int c) {
        return String.format(Locale.US, "#%06X", 0xFFFFFF & c);
    }

    private String number(JSONObject object, String key) {
        return object == null ? "—" : fmt(object.optInt(key, 0));
    }

    private String fmt(double value) {
        return NumberFormat.getNumberInstance(new Locale("fa", "IR")).format(value);
    }

    private String numberKg(double value) {
        if (Math.abs(value - Math.rint(value)) < 0.05) return fmt(Math.rint(value));
        return NumberFormat.getNumberInstance(new Locale("fa", "IR")).format(value);
    }

    private String numberCoordinate(double value) {
        return String.format(Locale.US, "%.5f", value);
    }

    private String emptyDash(String s) {
        return s == null || s.trim().isEmpty() || "null".equals(s) ? "—" : s.trim();
    }

    private String companyFa(String code) {
        if ("rojin".equalsIgnoreCase(code) || "روژین".equals(code)) return "روژین";
        if ("zhik".equalsIgnoreCase(code) || "ژیک".equals(code)) return "ژیک";
        return emptyDash(code);
    }

    private String tripStatusFa(String status) {
        switch (status) {
            case "planned": return "برنامه‌ریزی‌شده";
            case "active": return "در مسیر";
            case "finished": return "پایان‌یافته";
            case "cancelled": return "لغوشده";
            case "idle": return "بدون سفر";
            default: return emptyDash(status);
        }
    }

    private String roleFa(String role) {
        switch (role) {
            case "admin": case "system_admin": return "مدیر";
            case "user": return "کاربر";
            case "loader": return "بارگیر";
            default: return role;
        }
    }

    private String onlineFa(String state) {
        switch (state) {
            case "online": return "متصل";
            case "offline_or_stale": return "آفلاین یا موقعیت قدیمی";
            case "standby": return "آماده‌به‌کار";
            default: return emptyDash(state);
        }
    }

    private String jsonArrayJoined(JSONArray values) {
        List<String> items = new ArrayList<>();
        for (int i = 0; i < values.length(); i++) items.add(values.optString(i, ""));
        StringBuilder joined = new StringBuilder();
        for (String item : items) {
            if (joined.length() > 0) joined.append("، ");
            joined.append(item);
        }
        return joined.toString();
    }

    private String normalize(String value) {
        if (value == null) return "";
        return value.trim().toLowerCase(Locale.ROOT)
                .replace('ي', 'ی').replace('ك', 'ک')
                .replace('۰', '0').replace('۱', '1').replace('۲', '2')
                .replace('۳', '3').replace('۴', '4').replace('۵', '5')
                .replace('۶', '6').replace('۷', '7').replace('۸', '8').replace('۹', '9');
    }

    private String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (Exception e) {
            return value;
        }
    }

    private void detachMap() {
        if (mapView != null) {
            try {
                mapView.onPause();
                mapView.onDetach();
            } catch (Exception ignored) {}
            mapView = null;
        }
    }
}
