var runMode = RUN_MODE_IDLE;

if (!window.console) {
    console = {
        log : function() {
        }
    };
}

// for Firefox
if (!detectChrome() && !detectIE() && !(typeof self === 'undefined')) {
    self.on('message', function(message) {
        if (message.kind == "postSuccess") {
            console.log("POST recorded element successful")
        } else if (message.kind == "postFail") {
            alert(message.text);
        }
    });
}

chrome.runtime.onMessage.addListener(function(request, sender, callback) {
    if (!request.action) {
        return;
    }
    switch (request.action) {
    case START_ADDON:
        start(request.runMode, request.data);
        break;
    case STOP_ADDON:
        stop();
        break;
    }
});

chrome.runtime.sendMessage({
    action : CHECK_ADDON_START_STATUS
}, function(response) {
    start(response.runMode, response.data);
});

function start(newRunMode, data) {
    switch (newRunMode) {
    case RUN_MODE_OBJECT_SPY:
        startObjectSpy(data);
        break;
    case RUN_MODE_RECORDER:
        startRecorder();
        break;
    case RUN_MODE_IDLE: 
        stop();
        break;
    }
}

function startObjectSpy(data) {
    if (runMode !== RUN_MODE_IDLE) {
        stop();
    }
    console.log("Starting Object Spy")
    $('document').ready(function() {
        startInspection(data);
        startGetRequestSchedule();
        runMode = RUN_MODE_OBJECT_SPY;
    });
}

function startRecorder() {
    if (runMode !== RUN_MODE_IDLE) {
        stop();
    }
    console.log("Starting Recorder")
    $('document').ready(function() {
        startRecord();
        runMode = RUN_MODE_RECORDER;
    });
}

function stop() {
    if (runMode === RUN_MODE_RECORDER) {
        endRecord();
    } else if (runMode === RUN_MODE_OBJECT_SPY) {
        endInspection();
    }
    runMode = RUN_MODE_IDLE;
}