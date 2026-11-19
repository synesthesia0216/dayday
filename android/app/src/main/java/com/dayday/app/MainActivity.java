package com.dayday.app;

import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    @Override
    public void onStart() {
        super.onStart();
        com.getcapacitor.Bridge b = getBridge();
        if (b != null && b.getWebView() != null) {
            b.getWebView().addJavascriptInterface(new ImageSaver(this), "ImageSaver");
            b.getWebView().addJavascriptInterface(new BackupSaver(this), "BackupSaver");
        }
    }

    // 沉浸式全屏：观星应用全时隐藏状态栏/导航栏，边缘滑动临时唤出。
    // 各家 OEM（MIUI/ColorOS 等）对系统栏 API 兼容性参差，任何失败都不得致命。
    @Override
    public void onResume() {
        super.onResume();
        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    private void hideSystemUI() {
        try {
            Window window = getWindow();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowCompat.setDecorFitsSystemWindows(window, false);
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                if (controller != null) {
                    controller.hide(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars());
                    controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            }
        } catch (Throwable t) {
            android.util.Log.w("DayDay", "hideSystemUI failed: " + t.getMessage());
        }
    }

    private static class ImageSaver {
        private final Context ctx;
        private final Handler handler = new Handler(Looper.getMainLooper());

        ImageSaver(Context ctx) { this.ctx = ctx; }

        @JavascriptInterface
        public void saveImage(String base64, String fileName) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) { toast("图片解码失败"); return; }

                OutputStream out;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                    values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Day-Day");
                    android.net.Uri uri = ctx.getContentResolver().insert(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) { toast("创建文件失败"); return; }
                    out = ctx.getContentResolver().openOutputStream(uri);
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_PICTURES), "Day-Day");
                    dir.mkdirs();
                    out = new FileOutputStream(new File(dir, fileName));
                    android.media.MediaScannerConnection.scanFile(ctx,
                        new String[]{new File(dir, fileName).getAbsolutePath()}, null, null);
                }
                if (out == null) { toast("保存失败"); return; }
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
                out.close();
                bitmap.recycle();
                toast("星图已保存到相册");
            } catch (Exception e) {
                toast("保存失败: " + e.getMessage());
            }
        }

        private void toast(String msg) {
            handler.post(() -> Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show());
        }
    }

    private static class BackupSaver {
        private final Context ctx;
        private final Handler handler = new Handler(Looper.getMainLooper());

        BackupSaver(Context ctx) { this.ctx = ctx; }

        @JavascriptInterface
        public String saveBackup(String base64, String fileName) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolverWrapper.save(ctx, fileName, bytes);
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) dir.mkdirs();
                    FileOutputStream fos = new FileOutputStream(new File(dir, fileName));
                    fos.write(bytes);
                    fos.close();
                }
                return null;
            } catch (Exception e) {
                return e.getMessage();
            }
        }

        @JavascriptInterface
        public String readBackup(String fileName) {
            try {
                InputStream in;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    in = ContentResolverWrapper.open(ctx, fileName);
                    if (in == null) return null;
                } else {
                    File f = new File(Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS), fileName);
                    if (!f.exists()) return null;
                    in = new FileInputStream(f);
                }
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
                in.close();
                return Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
            } catch (Exception e) {
                toast("读取备份失败: " + e.getMessage());
                return null;
            }
        }

        private void toast(String msg) {
            handler.post(() -> Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show());
        }
    }

    // MediaStore Downloads access (API 29+); apps can write the public
    // Downloads dir without storage permissions.
    private static class ContentResolverWrapper {
        static void save(Context ctx, String fileName, byte[] bytes) throws Exception {
            android.content.ContentResolver resolver = ctx.getContentResolver();
            Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            Uri uri = null;
            try (Cursor c = resolver.query(collection, new String[]{ MediaStore.Downloads._ID },
                    MediaStore.Downloads.DISPLAY_NAME + " = ?", new String[]{ fileName }, null)) {
                if (c != null && c.moveToFirst()) {
                    uri = ContentUris.withAppendedId(collection, c.getLong(0));
                }
            } catch (Exception ignored) {}
            if (uri == null) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                uri = resolver.insert(collection, values);
            }
            if (uri == null) throw new Exception("无法创建文件");
            OutputStream out = resolver.openOutputStream(uri);
            if (out == null) throw new Exception("无法写入文件");
            out.write(bytes);
            out.close();
            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
        }

        static InputStream open(Context ctx, String fileName) throws Exception {
            android.content.ContentResolver resolver = ctx.getContentResolver();
            Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            try (Cursor c = resolver.query(collection, new String[]{ MediaStore.Downloads._ID },
                    MediaStore.Downloads.DISPLAY_NAME + " = ?", new String[]{ fileName }, null)) {
                if (c != null && c.moveToFirst()) {
                    Uri uri = ContentUris.withAppendedId(collection, c.getLong(0));
                    return resolver.openInputStream(uri);
                }
            }
            return null;
        }
    }
}
