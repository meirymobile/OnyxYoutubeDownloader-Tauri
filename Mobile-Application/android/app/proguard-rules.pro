# Proguard rules for Onyx DJ™ Companion
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.onyx.dj.companion.** { *; }
