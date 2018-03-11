
// KAT-BEGIN show docs on install or upgrade from 1.0
chrome.runtime.onInstalled.addListener(function(details) {
    if (details.reason === 'install') {
        chrome.tabs.create({'url': 'https://www.katalon.com/automation-recorder'});
    } else if (details.reason === 'update') {
        var previousVersion = details.previousVersion;
        var previousMajorVersion = previousVersion.substring(0, previousVersion.indexOf('.'));
        if (previousMajorVersion === '1') {
            chrome.tabs.create({'url': 'https://www.katalon.com/automation-recorder'});
        }
    }
});

chrome.runtime.setUninstallURL('https://www.surveymonkey.com/r/katalon-recorder');
// KAT-END

// KAT-BEGIN save last window size
function getWindowSize(callback) {
    chrome.storage.local.get('window', function(result) {
        var height = 730;
        var width = 750;
        if (result) {
            try {
                result = result.window;
                if (result.height) {
                    height = result.height;
                }
                if (result.width) {
                    width = result.width;
                }
            } catch (e) {
            }
        }
        callback(height, width);
    });
}
// KAT-END

var attachedTabs = {};
var version = "1.0";

function onDetach(debuggeeId) {
    var tabId = debuggeeId.tabId;
    delete attachedTabs[tabId];
}

browser.runtime.onMessage.addListener(function(request, sender, sendResponse, type) {
    if (request.captureEntirePageScreenshot) {
        browser.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }).then(function(image) {
            sendResponse({
                image: image
            });
        });
        return true;
    } else if (request.uploadFile) {
        var tabId = sender.tab.id;
        var debuggeeId = {tabId:tabId};
        var doDetach = function(err) {
            console.log(err);
            chrome.debugger.detach(debuggeeId, function() {
                onDetach(debuggeeId);
                if (err) {
                    sendResponse({
                        status: false,
                        err: err.message
                    });
                } else {
                    sendResponse({
                        status: true
                    });
                }
            });
        };
        var doUploadFile = function () {
            attachedTabs[tabId] = true;
            chrome.debugger.sendCommand(
                debuggeeId,
                "DOM.getDocument",
                {},
                function (res) {
                    if (chrome.runtime.lastError) {
                        doDetach(chrome.runtime.lastError);
                    } else {
                        chrome.debugger.sendCommand(
                            debuggeeId,
                            "DOM.querySelector",
                            {
                                nodeId: res.root.nodeId,
                                selector: request.locator
                            },
                            function (res) {
                                if (chrome.runtime.lastError) {
                                    doDetach(chrome.runtime.lastError);
                                } else {
                                    chrome.debugger.sendCommand(
                                        debuggeeId,
                                        "DOM.setFileInputFiles",
                                        {
                                            nodeId: res.nodeId,
                                            files: [request.file]
                                        },
                                        function (res) {
                                            if (chrome.runtime.lastError) {
                                                doDetach(chrome.runtime.lastError);
                                            } else {
                                                doDetach();
                                            }
                                        }
                                    );
                                }
                            }
                        );
                    }
                }
            );
        };
        if (attachedTabs[tabId]) {
            doUploadFile();
        } else {
            chrome.debugger.attach(debuggeeId, version, doUploadFile);
        }
        return true;
    }
});

if (chrome.debugger) {
    chrome.debugger.onDetach.addListener(onDetach);
}

var externalExporters = {};

chrome.runtime.onMessageExternal.addListener(function(message, sender) {
    if (message.type === 'katalon_recorder_register') {
        externalExporters[sender.id] = {
            timestamp: new Date().getTime(),
            information: message.payload
        };
    }
});

browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.getKatalonRecorderExporters) {
        var now = new Date().getTime();
        Object.keys(externalExporters).forEach(function(id) {
            var externalExporter = externalExporters[id];
            var lastUpdate = externalExporter.timestamp;
            if ((now - lastUpdate) > 2 * 60 * 1000) {
                delete externalExporters[id];
            }
        });
        sendResponse(externalExporters);
    }
});
