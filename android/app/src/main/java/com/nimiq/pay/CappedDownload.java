package com.nimiq.pay;

import java.io.EOFException;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.BufferedSource;
import okio.GzipSource;
import okio.Okio;

/** Not HttpURLConnection: its cookies are the web view's, and the app's own origin gets those a site sets. */
final class CappedDownload {
    static final class TooLargeException extends IOException {}

    static final class EncodedException extends IOException {}

    static final class CanceledException extends IOException {}

    static final class Result {
        final int status;
        final Map<String, String> headers;
        final byte[] body;

        Result(int status, Map<String, String> headers, byte[] body) {
            this.status = status;
            this.headers = headers;
            this.body = body;
        }
    }

    // No cookie jar and no cache unless given one. HTTP/1.1, as only its reader bounds the headers (256 KiB).
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
        .followRedirects(false)
        .followSslRedirects(false)
        .protocols(Collections.singletonList(Protocol.HTTP_1_1))
        .build();

    // With the half on top of the limit, for what gzip adds to a body it can't shrink, flushed often too.
    private static final int GZIP_SLACK = 64 * 1024;

    private final Call call;
    private final List<String> responseHeaders;
    private final int maxBytes;
    private volatile boolean canceled;

    /** `idleMs`: to connect, to the first byte and between bytes. `totalMs`: the whole call, as idle restarts with each byte. */
    CappedDownload(String url, Map<String, String> headers, List<String> responseHeaders, int maxBytes, int idleMs, int totalMs) {
        OkHttpClient client = CLIENT.newBuilder()
            .connectTimeout(idleMs, TimeUnit.MILLISECONDS)
            .readTimeout(idleMs, TimeUnit.MILLISECONDS)
            .writeTimeout(idleMs, TimeUnit.MILLISECONDS)
            .callTimeout(totalMs, TimeUnit.MILLISECONDS)
            .build();
        Request.Builder request = new Request.Builder().url(url);
        for (Map.Entry<String, String> header : headers.entrySet()) request.header(header.getKey(), header.getValue());
        // Last, over the caller's. Setting it also leaves the decoding to get(): OkHttp's own puts no limit on a gzip header, which it holds in memory.
        request.header("Accept-Encoding", "gzip");
        this.call = client.newCall(request.build());
        this.responseHeaders = responseHeaders;
        this.maxBytes = maxBytes;
    }

    Result get() throws IOException {
        try (Response response = call.execute()) {
            int status = response.code();
            ResponseBody body = response.body();
            if (status != 200 || body == null) {
                // So that closing reads none of it.
                call.cancel();
                return new Result(status, named(response), new byte[0]);
            }
            try {
                List<String> codings = new ArrayList<>(Arrays.asList(String.join(",", response.headers("Content-Encoding")).toLowerCase(Locale.ROOT).trim().split("\\s*,\\s*")));
                codings.removeAll(Arrays.asList("", "identity"));
                boolean gzip = codings.size() == 1 && (codings.get(0).equals("gzip") || codings.get(0).equals("x-gzip"));
                if (!codings.isEmpty() && !gzip) throw new EncodedException();
                long wireMax = gzip ? maxBytes + maxBytes / 2L + GZIP_SLACK : maxBytes;
                if (body.contentLength() > wireMax) throw new TooLargeException();
                BufferedSource wire = body.source();
                if (wire.request(wireMax + 1)) throw new TooLargeException();
                if (!gzip) return new Result(status, named(response), wire.readByteArray());
                // Only once all of it is in: an endless header stops at wireMax, and what fails here is the gzip, never the network.
                try (BufferedSource plain = Okio.buffer(new GzipSource(wire.getBuffer()))) {
                    if (plain.request(maxBytes + 1L)) throw new TooLargeException();
                    return new Result(status, named(response), plain.readByteArray());
                } catch (TooLargeException | EOFException error) {
                    // Cut short, which can pass.
                    throw error;
                } catch (IOException error) {
                    throw new EncodedException();
                }
            } catch (IOException | OutOfMemoryError error) {
                // Before closing, which reads on for up to 100 ms. A chunk-size line has no limit in any Android client, so it can also run the heap out.
                call.cancel();
                throw error;
            }
        } catch (IOException error) {
            if (canceled) throw new CanceledException();
            throw error;
        }
    }

    /** From any thread, also before get. */
    void cancel() {
        canceled = true;
        call.cancel();
    }

    private Map<String, String> named(Response response) {
        Map<String, String> named = new HashMap<>();
        for (String name : responseHeaders) {
            String key = name.toLowerCase(Locale.ROOT);
            List<String> values = response.headers(name);
            if (!values.isEmpty() && !key.startsWith("set-cookie")) named.put(key, String.join(", ", values));
        }
        return named;
    }
}
