package com.auraai.app;

import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableArray;

import java.io.File;

public class BackgroundModelDownloadModule extends ReactContextBaseJavaModule {
  private static final String NAME = "AuraBackgroundModelDownload";
  private static final String PREFS = "aura_model_downloads";

  public BackgroundModelDownloadModule(ReactApplicationContext context) {
    super(context);
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  private File modelsDirectory() {
    File directory = new File(getReactApplicationContext().getFilesDir(), "models");
    if (!directory.exists() && !directory.mkdirs()) {
      throw new IllegalStateException("Unable to create the model directory.");
    }
    return directory;
  }

  @ReactMethod
  public void start(String url, String fileName, Promise promise) {
    try {
      File destination = new File(modelsDirectory(), fileName + ".part");
      if (destination.exists() && !destination.delete()) {
        throw new IllegalStateException("Unable to replace the incomplete model download.");
      }

      DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
        .setTitle(fileName)
        .setDescription("Downloading AURA model")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(true)
        .setDestinationUri(Uri.fromFile(destination));

      long id = ((DownloadManager) getReactApplicationContext().getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
      getReactApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putString(Long.toString(id), fileName)
        .putString(Long.toString(id) + ".url", url).apply();
      WritableMap result = Arguments.createMap();
      result.putDouble("id", id);
      result.putString("partPath", destination.getAbsolutePath());
      promise.resolve(result);
    } catch (Exception error) {
      promise.reject("DOWNLOAD_START_FAILED", error.getMessage(), error);
    }
  }

  @ReactMethod
  public void status(double downloadId, Promise promise) {
    DownloadManager manager = (DownloadManager) getReactApplicationContext().getSystemService(Context.DOWNLOAD_SERVICE);
    try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById((long) downloadId))) {
      if (cursor == null || !cursor.moveToFirst()) {
        promise.reject("DOWNLOAD_NOT_FOUND", "The Android download was not found.");
        return;
      }

      int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
      long bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
      long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
      int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
      WritableMap result = Arguments.createMap();
      result.putInt("status", status);
      result.putDouble("bytesWritten", bytes);
      result.putDouble("totalBytes", total);
      result.putInt("reason", reason);
      promise.resolve(result);
    } catch (Exception error) {
      promise.reject("DOWNLOAD_STATUS_FAILED", error.getMessage(), error);
    }
  }

  @ReactMethod
  public void complete(double downloadId, String fileName, Promise promise) {
    DownloadManager manager = (DownloadManager) getReactApplicationContext().getSystemService(Context.DOWNLOAD_SERVICE);
    try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById((long) downloadId))) {
      if (cursor == null || !cursor.moveToFirst()) {
        promise.reject("DOWNLOAD_NOT_FOUND", "The Android download was not found.");
        return;
      }
      int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
      if (status != DownloadManager.STATUS_SUCCESSFUL) {
        promise.reject("DOWNLOAD_NOT_COMPLETE", "The model download is not complete.");
        return;
      }

      File part = new File(modelsDirectory(), fileName + ".part");
      File destination = new File(modelsDirectory(), fileName);
      if (!part.exists() || part.length() <= 0) {
        promise.reject("DOWNLOAD_FILE_MISSING", "The completed download file is missing.");
        return;
      }
      if (destination.exists() && !destination.delete()) {
        promise.reject("DOWNLOAD_FINALIZE_FAILED", "Unable to replace the model file.");
        return;
      }
      if (!part.renameTo(destination)) {
        promise.reject("DOWNLOAD_FINALIZE_FAILED", "Unable to finalize the model file.");
        return;
      }
      getReactApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().remove(Long.toString((long) downloadId))
        .remove(Long.toString((long) downloadId) + ".url").apply();
      promise.resolve(Uri.fromFile(destination).toString());
    } catch (Exception error) {
      promise.reject("DOWNLOAD_FINALIZE_FAILED", error.getMessage(), error);
    }
  }

  @ReactMethod
  public void cancel(double downloadId, Promise promise) {
    DownloadManager manager = (DownloadManager) getReactApplicationContext().getSystemService(Context.DOWNLOAD_SERVICE);
    manager.remove((long) downloadId);
    getReactApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().remove(Long.toString((long) downloadId))
      .remove(Long.toString((long) downloadId) + ".url").apply();
    promise.resolve(null);
  }

  @ReactMethod
  public void list(Promise promise) {
    DownloadManager manager = (DownloadManager) getReactApplicationContext().getSystemService(Context.DOWNLOAD_SERVICE);
    SharedPreferences preferences = getReactApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    WritableArray downloads = Arguments.createArray();
    for (String idValue : preferences.getAll().keySet()) {
      if (idValue.endsWith(".url")) continue;
      try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(Long.parseLong(idValue)))) {
        if (cursor == null || !cursor.moveToFirst()) continue;
        String fileName = preferences.getString(idValue, "model.gguf");
        String url = preferences.getString(idValue + ".url", "");
        WritableMap item = Arguments.createMap();
        item.putDouble("id", Double.parseDouble(idValue));
        item.putString("fileName", fileName);
        item.putString("url", url);
        item.putInt("status", cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)));
        item.putDouble("bytesWritten", cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)));
        item.putDouble("totalBytes", cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)));
        item.putInt("reason", cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)));
        downloads.pushMap(item);
      } catch (Exception ignored) {
        // A stale DownloadManager entry is reconciled separately.
      }
    }
    promise.resolve(downloads);
  }

  @ReactMethod
  public void reconcile(Promise promise) {
    DownloadManager manager = (DownloadManager) getReactApplicationContext().getSystemService(Context.DOWNLOAD_SERVICE);
    SharedPreferences preferences = getReactApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    WritableMap result = Arguments.createMap();
    WritableArray canceled = Arguments.createArray();
    int completed = 0;
    for (String idValue : preferences.getAll().keySet()) {
      if (idValue.endsWith(".url")) continue;
      long id;
      try {
        id = Long.parseLong(idValue);
      } catch (NumberFormatException ignored) {
        continue;
      }
      String fileName = preferences.getString(idValue, null);
      if (fileName == null) continue;
      String url = preferences.getString(idValue + ".url", "");
      try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
        if (cursor == null || !cursor.moveToFirst()) continue;
        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
        if (status == DownloadManager.STATUS_SUCCESSFUL) {
          File part = new File(modelsDirectory(), fileName + ".part");
          File destination = new File(modelsDirectory(), fileName);
          if (part.exists() && part.length() > 0 && (!destination.exists() || destination.delete()) && part.renameTo(destination)) {
            completed++;
          }
          preferences.edit().remove(idValue).remove(idValue + ".url").apply();
        } else if (status == DownloadManager.STATUS_FAILED) {
          WritableMap failed = Arguments.createMap();
          failed.putString("fileName", fileName);
          failed.putString("url", url);
          canceled.pushMap(failed);
          preferences.edit().remove(idValue).remove(idValue + ".url").apply();
        }
      }
    }
    result.putInt("completed", completed);
    result.putArray("canceled", canceled);
    promise.resolve(result);
  }
}
