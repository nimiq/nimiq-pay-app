# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# SQLite
-keep class net.sqlcipher.** { *; }
-keepclassmembers class net.sqlcipher.** { *; }

-dontwarn org.slf4j.impl.StaticLoggerBinder

# Capacitor reads @CapacitorPlugin/@Permission at runtime. Without a keep on the
# annotation types, R8 optimization treats them as never instantiated and folds
# PluginHandle.getPluginAnnotation() to null (NPE in checkPermissions).
-keep @interface com.getcapacitor.annotation.*
-keep @interface com.getcapacitor.NativePlugin
-keep @interface com.getcapacitor.PluginMethod
