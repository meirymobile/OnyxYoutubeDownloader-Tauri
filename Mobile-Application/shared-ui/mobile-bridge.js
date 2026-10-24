/**
 * Onyx DJ™ Mobile Bridge
 * High-performance native bridge unifying Android (Kotlin) & iOS (Swift/WebKit) hardware access.
 * © 2026 Onyx DJ™ Systems by Meir.Y. All rights reserved.
 */

(function (window) {
  'use strict';

  var MobileBridge = {
    platform: 'web', // 'android' | 'ios' | 'web'
    isNative: false,
    wakeLockSentinel: null,

    init: function () {
      // 1. Check for Android Native Bridge
      if (window.OnyxNativeBridge && typeof window.OnyxNativeBridge.setTorch === 'function') {
        this.platform = 'android';
        this.isNative = true;
        console.log('[MobileBridge] Android Native Bridge active');
      }
      // 2. Check for iOS WebKit Message Handlers
      else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.onyxNative) {
        this.platform = 'ios';
        this.isNative = true;
        console.log('[MobileBridge] iOS WebKit Native Bridge active');
      } else {
        this.platform = 'web';
        this.isNative = false;
        console.log('[MobileBridge] Running in standard Web mode');
      }

      // Automatically request screen wake lock if available in browser
      if (!this.isNative && 'wakeLock' in navigator) {
        this.enableWebWakeLock();
      }
    },

    /**
     * Controls the physical camera LED torch
     * @param {boolean} enabled 
     */
    setTorch: function (enabled) {
      if (this.platform === 'android') {
        try {
          window.OnyxNativeBridge.setTorch(!!enabled);
        } catch (e) {
          console.warn('[MobileBridge] Android setTorch error:', e);
        }
      } else if (this.platform === 'ios') {
        try {
          window.webkit.messageHandlers.onyxNative.postMessage({
            action: 'setTorch',
            level: enabled ? 1.0 : 0.0
          });
        } catch (e) {
          console.warn('[MobileBridge] iOS setTorch error:', e);
        }
      } else {
        // Fallback for browsers supporting ImageCapture torch
        this._setWebTorch(enabled);
      }
    },

    /**
     * Fires a high-precision hardware strobe flash
     * @param {number} durationMs 
     */
    pulseStrobe: function (durationMs) {
      durationMs = durationMs || 45;
      if (this.platform === 'android') {
        try {
          window.OnyxNativeBridge.pulseStrobe(durationMs);
        } catch (e) {
          this.setTorch(true);
          setTimeout(() => this.setTorch(false), durationMs);
        }
      } else if (this.platform === 'ios') {
        try {
          window.webkit.messageHandlers.onyxNative.postMessage({
            action: 'triggerStrobe',
            durationMs: durationMs
          });
        } catch (e) {
          this.setTorch(true);
          setTimeout(() => this.setTorch(false), durationMs);
        }
      } else {
        this.setTorch(true);
        setTimeout(() => this.setTorch(false), durationMs);
      }
    },

    /**
     * Triggers tactical sub-bass haptic kick
     */
    triggerBassHaptic: function () {
      if (this.platform === 'android') {
        try {
          window.OnyxNativeBridge.triggerBassKick();
        } catch (e) {
          if ('vibrate' in navigator) navigator.vibrate(45);
        }
      } else if (this.platform === 'ios') {
        try {
          window.webkit.messageHandlers.onyxNative.postMessage({
            action: 'triggerBassHaptic'
          });
        } catch (e) {
          if ('vibrate' in navigator) navigator.vibrate(45);
        }
      } else {
        if ('vibrate' in navigator) {
          navigator.vibrate(45);
        }
      }
    },

    /**
     * Wakes screen from sleep and turns display on
     */
    turnScreenOn: function () {
      if (this.platform === 'android') {
        try {
          window.OnyxNativeBridge.turnScreenOn();
        } catch (e) {
          console.warn('[MobileBridge] Android turnScreenOn error:', e);
        }
      } else if (this.platform === 'ios') {
        try {
          window.webkit.messageHandlers.onyxNative.postMessage({
            action: 'turnScreenOn'
          });
        } catch (e) {
          console.warn('[MobileBridge] iOS turnScreenOn error:', e);
        }
      }
    },

    /**
     * Brings application activity to the front immediately
     */
    bringToFront: function () {
      if (this.platform === 'android' && window.OnyxNativeBridge && typeof window.OnyxNativeBridge.bringToFront === 'function') {
        try {
          window.OnyxNativeBridge.bringToFront();
        } catch (e) {
          console.warn('[MobileBridge] Android bringToFront error:', e);
        }
      }
    },

    /**
     * Starts native hardware strobe loop immune to background throttling
     * @param {number} bpm
     */
    startNativeStrobe: function (bpm) {
      bpm = bpm || 128;
      if (this.platform === 'android' && window.OnyxNativeBridge && typeof window.OnyxNativeBridge.startNativeStrobe === 'function') {
        try {
          window.OnyxNativeBridge.startNativeStrobe(bpm);
        } catch (e) {
          console.warn('[MobileBridge] Android startNativeStrobe error:', e);
        }
      }
    },

    /**
     * Stops native hardware strobe loop and turns off LED
     */
    stopNativeStrobe: function () {
      if (this.platform === 'android' && window.OnyxNativeBridge && typeof window.OnyxNativeBridge.stopNativeStrobe === 'function') {
        try {
          window.OnyxNativeBridge.stopNativeStrobe();
        } catch (e) {
          console.warn('[MobileBridge] Android stopNativeStrobe error:', e);
        }
      }
      this.setTorch(false);
    },

    /**
     * Keeps screen permanently on during the event
     * @param {boolean} enabled 
     */
    setKeepScreenOn: function (enabled) {
      if (this.platform === 'android') {
        try {
          window.OnyxNativeBridge.setKeepScreenOn(!!enabled);
        } catch (e) {
          console.warn('[MobileBridge] Android setKeepScreenOn error:', e);
        }
      } else if (this.platform === 'ios') {
        try {
          window.webkit.messageHandlers.onyxNative.postMessage({
            action: 'setIdleTimerDisabled',
            disabled: !!enabled
          });
        } catch (e) {
          console.warn('[MobileBridge] iOS setIdleTimerDisabled error:', e);
        }
      }

      if (enabled) {
        this.enableWebWakeLock();
      } else {
        this.releaseWebWakeLock();
      }
    },

    /**
     * Updates iOS Dynamic Island & Lock Screen Live Activities
     * @param {Object} data { currentTrackTitle, bpm, isStrobeActive, stageMessage, isUserSongNext }
     */
    updateLiveActivity: function (data) {
      if (this.platform === 'ios') {
        try {
          window.webkit.messageHandlers.onyxNative.postMessage({
            action: 'updateLiveActivity',
            data: data
          });
        } catch (e) {
          console.warn('[MobileBridge] iOS updateLiveActivity error:', e);
        }
      }
    },

    /**
     * Native image share (WhatsApp / Instagram / System Sheet)
     * @param {string} base64Data 
     * @param {string} target 'whatsapp' | 'instagram' | 'system'
     */
    shareImage: function (base64Data, target) {
      target = target || 'system';
      if (this.platform === 'android') {
        try {
          window.OnyxNativeBridge.shareImage(base64Data, target);
          return;
        } catch (e) {
          console.warn('[MobileBridge] Android shareImage fallback:', e);
        }
      } else if (this.platform === 'ios') {
        try {
          window.webkit.messageHandlers.onyxNative.postMessage({
            action: 'shareImage',
            base64Data: base64Data,
            target: target
          });
          return;
        } catch (e) {
          console.warn('[MobileBridge] iOS shareImage fallback:', e);
        }
      }

      // Web Fallback: Web Share API or WhatsApp Web URL
      if (navigator.share && target === 'system') {
        this._webShareFallback(base64Data);
      } else if (target === 'whatsapp') {
        window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent('השיר שלי וההקדשה על מסך הבמה של Onyx DJ! 🎵🔥'), '_blank');
      } else {
        this._downloadBase64Image(base64Data, 'onyx-dj-story.png');
      }
    },

    /**
     * Saves image directly to phone's native photo gallery
     * @param {string} base64Data 
     */
    saveImageToGallery: function (base64Data) {
      if (this.platform === 'android') {
        try {
          window.OnyxNativeBridge.saveImageToGallery(base64Data);
          return;
        } catch (e) {
          console.warn('[MobileBridge] Android saveToGallery fallback:', e);
        }
      } else if (this.platform === 'ios') {
        try {
          window.webkit.messageHandlers.onyxNative.postMessage({
            action: 'saveImageToGallery',
            base64Data: base64Data
          });
          return;
        } catch (e) {
          console.warn('[MobileBridge] iOS saveToGallery fallback:', e);
        }
      }

      // Web Fallback
      this._downloadBase64Image(base64Data, 'onyx-vip-memory-' + Date.now() + '.png');
    },

    // Internal Helpers
    enableWebWakeLock: async function () {
      if ('wakeLock' in navigator && !this.wakeLockSentinel) {
        try {
          this.wakeLockSentinel = await navigator.wakeLock.request('screen');
          this.wakeLockSentinel.addEventListener('release', () => {
            this.wakeLockSentinel = null;
          });
        } catch (err) {
          console.log('[MobileBridge] WakeLock request error:', err);
        }
      }
    },

    releaseWebWakeLock: function () {
      if (this.wakeLockSentinel) {
        this.wakeLockSentinel.release();
        this.wakeLockSentinel = null;
      }
    },

    _webTorchTrack: null,
    _setWebTorch: async function (enabled) {
      try {
        if (enabled && !this._webTorchTrack) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
          });
          const track = stream.getVideoTracks()[0];
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          if (capabilities.torch) {
            await track.applyConstraints({ advanced: [{ torch: true }] });
            this._webTorchTrack = track;
          }
        } else if (!enabled && this._webTorchTrack) {
          await this._webTorchTrack.applyConstraints({ advanced: [{ torch: false }] });
          this._webTorchTrack.stop();
          this._webTorchTrack = null;
        }
      } catch (e) {
        // Torch not available or permission denied in browser
      }
    },

    _webShareFallback: async function (base64Data) {
      try {
        const res = await fetch(base64Data);
        const blob = await res.blob();
        const file = new File([blob], 'onyx-dj-card.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Onyx DJ Stage Card',
            text: 'השיר וההקדשה שלי על הבמה של Onyx DJ! 🎵'
          });
        }
      } catch (e) {
        this._downloadBase64Image(base64Data, 'onyx-dj-card.png');
      }
    },

    enterFullScreen: function () {
      if (this.platform === 'android') {
        try { window.OnyxNativeBridge.enterFullScreen(); } catch (e) {}
      }
      if (!document.fullscreenElement && (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullScreen)) {
        try {
          const req = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullScreen;
          req.call(document.documentElement).catch(() => {});
        } catch (err) {}
      }
    },

    exitFullScreen: function () {
      if (this.platform === 'android') {
        try { window.OnyxNativeBridge.exitFullScreen(); } catch (e) {}
      }
      if (document.fullscreenElement && document.exitFullscreen) {
        try { document.exitFullscreen().catch(() => {}); } catch (err) {}
      }
    },

    showNotification: function (title, message) {
      if (this.platform === 'android') {
        try { window.OnyxNativeBridge.showNotification(title, message); } catch (e) {}
      } else if (this.platform === 'ios') {
        try {
          window.webkit.messageHandlers.onyxNative.postMessage({
            action: 'showNotification',
            title: title,
            message: message
          });
        } catch (e) {}
      } else if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body: message, icon: './icon.png' }); } catch (e) {}
      }
    },

    checkPermissionsStatus: function () {
      if (this.platform === 'android' && window.OnyxNativeBridge && typeof window.OnyxNativeBridge.checkPermissionsStatus === 'function') {
        try {
          return JSON.parse(window.OnyxNativeBridge.checkPermissionsStatus());
        } catch (e) {}
      }
      return { camera: false, location: false, notifications: false, allGranted: false };
    },

    requestAllPermissions: function () {
      if (this.platform === 'android') {
        try { window.OnyxNativeBridge.requestAllPermissions(); } catch (e) {}
      } else if (this.platform === 'ios') {
        try {
          window.webkit.messageHandlers.onyxNative.postMessage({ action: 'requestAllPermissions' });
        } catch (e) {}
      }
      if ('Notification' in window && Notification.permission === 'default') {
        try { Notification.requestPermission(); } catch (e) {}
      }
      if (navigator.geolocation) {
        try { navigator.geolocation.getCurrentPosition(() => {}, () => {}); } catch (e) {}
      }
    },

    openAppSettings: function () {
      if (this.platform === 'android' && window.OnyxNativeBridge && typeof window.OnyxNativeBridge.openAppSettings === 'function') {
        try { window.OnyxNativeBridge.openAppSettings(); } catch (e) {}
      }
    },

    requestIgnoreBatteryOptimizations: function () {
      if (this.platform === 'android' && window.OnyxNativeBridge && typeof window.OnyxNativeBridge.requestIgnoreBatteryOptimizations === 'function') {
        try { window.OnyxNativeBridge.requestIgnoreBatteryOptimizations(); } catch (e) {}
      }
    },

    /**
     * Adds an event to the native calendar (Android Intent or iOS/Web .ics download)
     * @param {Object} opts { title, description, location, startTimestamp, endTimestamp, dateStr, timeStr }
     */
    addToCalendar: function (opts) {
      opts = opts || {};
      var title = opts.title || 'מסיבת Onyx DJ VIP';
      var description = opts.description || opts.message || 'אירוע מיוחד של Onyx DJ';
      var location = opts.location || 'עמדת ה-DJ';
      var startTime = opts.startTimestamp;
      
      if (!startTime && opts.dateStr) {
        try {
          var datePart = opts.dateStr;
          var timePart = opts.timeStr || '22:00';
          startTime = new Date(datePart + 'T' + timePart + ':00').getTime();
        } catch (_) {}
      }
      if (!startTime || isNaN(startTime)) {
        startTime = Date.now() + 86400000; // Tomorrow
      }
      var endTime = opts.endTimestamp || (startTime + (4 * 3600000)); // Default 4 hours duration

      if (this.platform === 'android' && window.OnyxNativeBridge && typeof window.OnyxNativeBridge.addToCalendar === 'function') {
        try {
          window.OnyxNativeBridge.addToCalendar(title, description, location, startTime, endTime);
          return;
        } catch (e) {
          console.warn('[MobileBridge] Android addToCalendar failed:', e);
        }
      }

      // Universal .ics generator (Apple Calendar, Google Calendar Web, Outlook)
      try {
        var startIso = new Date(startTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        var endIso = new Date(endTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        var nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        var uid = 'onyx_evt_' + startTime + '@onyxdj.vip';

        var icsContent = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Onyx DJ Systems//VIP Mobile Events//HE',
          'CALSCALE:GREGORIAN',
          'METHOD:PUBLISH',
          'BEGIN:VEVENT',
          'UID:' + uid,
          'DTSTAMP:' + nowIso,
          'DTSTART:' + startIso,
          'DTEND:' + endIso,
          'SUMMARY:' + title.replace(/\n/g, ' '),
          'DESCRIPTION:' + description.replace(/\n/g, '\\n'),
          'LOCATION:' + location.replace(/\n/g, ' '),
          'STATUS:CONFIRMED',
          'END:VEVENT',
          'END:VCALENDAR'
        ].join('\r\n');

        var blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'party-invitation.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      } catch (err) {
        console.error('[MobileBridge] Failed to create .ics calendar file:', err);
      }
    },

    /**
     * Opens native mail client with prefilled recipient, subject and body
     * @param {string} email
     * @param {string} subject
     * @param {string} body
     */
    openEmailClient: function (email, subject, body) {
      email = email || '';
      subject = subject || 'אישור הגעה לאירוע / שאלה ל-DJ';
      body = body || '';

      if (this.platform === 'android' && window.OnyxNativeBridge && typeof window.OnyxNativeBridge.openEmailClient === 'function') {
        try {
          window.OnyxNativeBridge.openEmailClient(email, subject, body);
          return;
        } catch (e) {
          console.warn('[MobileBridge] Android openEmailClient failed:', e);
        }
      }

      var mailtoUrl = 'mailto:' + encodeURIComponent(email) +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
      window.location.href = mailtoUrl;
    },

    _downloadBase64Image: function (base64Data, filename) {
      const a = document.createElement('a');
      a.href = base64Data;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Expose to window
  window.MobileBridge = MobileBridge;
  window.addEventListener('DOMContentLoaded', function () {
    MobileBridge.init();
  });
})(window);
