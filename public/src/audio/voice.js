/* VoiceChat — peer-to-peer voice over a WebRTC mesh (design point: ~10 players).
   Signaling rides the existing socket.io connection; media never touches the
   game server. Push-to-talk (hold T). The newcomer-initiates rule keeps
   offer/answer glare-free. STUN only: rare NAT pairs may fail (no TURN). */
var VoiceChat = (function () {
  "use strict";
  var localStream = null;
  var peers = {};            // id -> { pc, el, pendingIce: [] }
  var joined = false;
  var talking = false;
  var sendSignal = null;     // set by init: function (toId, data)

  var RTC_CFG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

  function init(sendSignalFn) { sendSignal = sendSignalFn; }

  function join(onResult) {
    if (joined) { if (onResult) onResult(true); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      UI.toast("Voice unsupported in this browser");
      if (onResult) onResult(false); return;
    }
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }).then(function (stream) {
      localStream = stream;
      joined = true;
      setTalking(false);               // PTT: start muted
      Net.voiceJoin();                 // server replies with existing peer ids
      if (onResult) onResult(true);
    }).catch(function () {
      UI.toast("Microphone permission denied");
      if (onResult) onResult(false);
    });
  }

  function leave() {
    if (!joined) return;
    joined = false;
    Net.voiceLeave();
    for (var id in peers) closePeer(id);
    if (localStream) { localStream.getTracks().forEach(function (t) { t.stop(); }); localStream = null; }
    talking = false;
    UI.setVoiceState("off");
  }

  function makePeer(id, initiator) {
    if (peers[id]) return peers[id];
    var pc = new RTCPeerConnection(RTC_CFG);
    var el = new Audio();
    el.autoplay = true;
    var P = { pc: pc, el: el, pendingIce: [] };
    peers[id] = P;
    if (localStream) localStream.getTracks().forEach(function (t) { pc.addTrack(t, localStream); });
    pc.ontrack = function (ev) { el.srcObject = ev.streams[0]; };
    pc.onicecandidate = function (ev) { if (ev.candidate) sendSignal(id, { c: ev.candidate }); };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(id);
    };
    if (initiator) {
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
        .then(function () { sendSignal(id, { sdp: pc.localDescription }); })
        .catch(function () {});
    }
    return P;
  }

  function closePeer(id) {
    var P = peers[id];
    if (!P) return;
    try { P.pc.close(); } catch (e) {}
    P.el.srcObject = null;
    delete peers[id];
  }

  // ---- events wired from net.js ----
  function onPeerList(ids) {           // I just joined: I initiate to everyone existing
    (ids || []).forEach(function (id) { makePeer(id, true); });
    UI.setVoiceState("on");
  }
  function onPeerJoin() { /* newcomer initiates; nothing to do on this side */ }
  function onPeerLeave(id) { closePeer(id); }

  function onSignal(from, data) {
    if (!joined || !data) return;
    var P = makePeer(from, false);
    if (data.sdp) {
      var desc = new RTCSessionDescription(data.sdp);
      P.pc.setRemoteDescription(desc).then(function () {
        P.pendingIce.forEach(function (c) { P.pc.addIceCandidate(c).catch(function () {}); });
        P.pendingIce = [];
        if (desc.type === "offer") {
          P.pc.createAnswer().then(function (a) { return P.pc.setLocalDescription(a); })
            .then(function () { sendSignal(from, { sdp: P.pc.localDescription }); })
            .catch(function () {});
        }
      }).catch(function () {});
    } else if (data.c) {
      if (P.pc.remoteDescription) P.pc.addIceCandidate(data.c).catch(function () {});
      else P.pendingIce.push(data.c);   // ICE can arrive before the SDP does
    }
  }

  function setTalking(b) {
    if (!localStream) return;
    talking = !!b && joined;
    localStream.getAudioTracks().forEach(function (t) { t.enabled = talking; });
    UI.setVoiceState(joined ? (talking ? "talking" : "on") : "off");
  }

  return {
    init: init, join: join, leave: leave,
    onPeerList: onPeerList, onPeerJoin: onPeerJoin, onPeerLeave: onPeerLeave,
    onSignal: onSignal, setTalking: setTalking,
    isJoined: function () { return joined; }
  };
})();
