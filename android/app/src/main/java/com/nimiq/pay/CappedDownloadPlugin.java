package com.nimiq.pay;

import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Public: Capacitor's R8 rules keep only public plugins, and without this one release builds have no widgets.
@CapacitorPlugin(name = "CappedDownload")
public class CappedDownloadPlugin extends Plugin {

    // Never shut down: a call queued before the activity went still runs after handleOnDestroy.
    private static final ExecutorService EXECUTOR = Executors.newCachedThreadPool();

    private final Map<String, CappedDownload> downloads = new ConcurrentHashMap<>();
    private volatile boolean destroyed;

    @PluginMethod
    public void get(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        JSObject headers = call.getObject("headers");
        JSArray responseHeaders = call.getArray("responseHeaders");
        Integer maxBytes = call.getInt("maxBytes");
        Integer idleTimeout = call.getInt("idleTimeout");
        Integer timeout = call.getInt("timeout");
        if (id == null || url == null || headers == null || responseHeaders == null || maxBytes == null || idleTimeout == null || timeout == null || maxBytes <= 0 || idleTimeout <= 0 || timeout <= 0) {
            call.reject("id, url, headers, responseHeaders, maxBytes, idleTimeout and timeout are required");
            return;
        }
        CappedDownload download;
        try {
            download = new CappedDownload(url, toMap(headers), toList(responseHeaders), maxBytes, idleTimeout, timeout);
        } catch (IllegalArgumentException error) {
            // Not its message, which quotes the URL or header, and those can be secret.
            call.reject("The URL or a header is not valid");
            return;
        }
        // Here rather than on the executor, so a cancel right behind finds it.
        downloads.put(id, download);
        // After the put: one that handleOnDestroy was too early to see sees this.
        if (destroyed) download.cancel();
        EXECUTOR.execute(() -> {
            try {
                CappedDownload.Result result = download.get();
                JSObject answered = new JSObject();
                for (Map.Entry<String, String> header : result.headers.entrySet()) answered.put(header.getKey(), header.getValue());
                JSObject answer = new JSObject();
                answer.put("status", result.status);
                answer.put("headers", answered);
                answer.put("data", Base64.encodeToString(result.body, Base64.NO_WRAP));
                call.resolve(answer);
            } catch (CappedDownload.TooLargeException error) {
                call.reject("The download is larger than its limit", "TOO_LARGE");
            } catch (CappedDownload.EncodedException error) {
                call.reject("The download is in an encoding this can't decode", "ENCODED");
            } catch (CappedDownload.CanceledException error) {
                call.reject("The download was canceled", "CANCELED");
            } catch (Exception | OutOfMemoryError error) {
                // Not its message, which can quote a secret URL.
                call.reject("The download failed: " + error.getClass().getSimpleName());
            } finally {
                downloads.remove(id, download);
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        CappedDownload download = downloads.get(id);
        if (download != null) download.cancel();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        for (CappedDownload download : downloads.values()) download.cancel();
    }

    private static List<String> toList(JSArray array) {
        List<String> list = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) list.add(array.optString(i));
        return list;
    }

    private static Map<String, String> toMap(JSObject object) {
        Map<String, String> map = new HashMap<>();
        for (Iterator<String> keys = object.keys(); keys.hasNext();) {
            String key = keys.next();
            String value = object.getString(key);
            if (value != null) map.put(key, value);
        }
        return map;
    }
}
