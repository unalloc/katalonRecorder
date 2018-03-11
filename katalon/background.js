var CONNECTING_ERROR_MESSAGE = "Cannot connect to Katalon Server. Make sure you have started Object Spy on Katalon application."

var registeredRequest = false;
var requestId = 0;
var katalonServer;
var clientId = -1;
var REQUEST_SEPARATOR = "_|_";

var clientSocket = null;
var runMode = RUN_MODE_IDLE;
var runData = {};

var curTabID = 0;
var curWinID = 0;

chrome.tabs.onSelectionChanged.addListener(function(tabId, selectInfo) {
    if (clientSocket !== null) {
        return;
    }
    curTabID = tabId;
    curWinID = selectInfo.windowId;
});

chrome.windows.onFocusChanged.addListener(function(windowId) {
    if (clientSocket !== null || windowId === chrome.windows.WINDOW_ID_NONE) {
        return;
    }
    curWinID = windowId;
});

chrome.windows.onCreated.addListener(function() {
    setCurrentWindow();
})

var injectIntoTab = function(tab) {
    // You could iterate through the content scripts here
    var scripts = chrome.app.getDetails().content_scripts[0].js;
    var s = scripts.length;
    for (var i = 0; i < s; i++) {
        chrome.tabs.executeScript(tab.id, {
            file : scripts[i]
        });
    }
}

chrome.runtime.onInstalled.addListener(function(details) {
    // Get all windows
    chrome.windows.getAll({
        populate : true
    }, function(windows) {
        var w = windows.length;
        var currentWindow;
        for (var i = 0; i < w; i++) {
            currentWindow = windows[i];
            var t = currentWindow.tabs.length
            var currentTab;
            for (var j = 0; j < t; j++) {
                injectIntoTab(currentWindow.tabs[j]);
            }
        }
    });
    setCurrentWindow();
});

function processXHTTPAction(request, callback) {
    if (!clientSocket) {
        return;
    }
    clientSocket.send(request.data);
    callback();
    return true; // prevents the callback from being called too early on
}

function findElementInTab(xpathExpression, callbackWhenSuccess) {
    var found = false;

    chrome.tabs.query({}, function(tabs) {
        for (i = 0; i < tabs.length && found == false; ++i) {
            var tabUrl = tabs[i].url;
            if (tabUrl == null || (tabUrl.indexOf('http') != 0 && tabUrl.indexOf('file') != 0)) {
                continue;
            }
            var tabId = tabs[i].id;
            chrome.tabs.sendMessage(tabId, {
                srcTabId : tabId,
                request : 'KATALON_FIND_OBJECT',
                xpath : xpathExpression
            }, function(response) {
                if (response != undefined && response.found) {
                    callbackWhenSuccess(response.tabId);
                }
            });
        }
    });
}

function activeBrowserAndFlashElement(tabResult, xpathExpression) {
    chrome.tabs.update(tabResult, {
        highlighted : true
    }, function(tab) {
        chrome.tabs.get(tabResult, function(tab) {
            chrome.windows.update(tab.windowId, {
                focused : true
            }, function() {
                chrome.tabs.sendMessage(tabResult, {
                    request : 'KATALON_FLASH_OBJECT',
                    xpath : xpathExpression
                });
            });
        });
    });
}

function highlightObject(xpathExpression) {
    findElementInTab(xpathExpression, function(tabResult) {
        activeBrowserAndFlashElement(tabResult, xpathExpression);
    });
}

function findObject(xpathExpression) {
    findElementInTab(xpathExpression, function(tabId) {
        sendRequest("FOUND", true);
    });

}

function startSendRequest(request) {
    if (registeredRequest) {
        return;
    }
    registeredRequest = true;
    katalonServer = request.url;
    setInterval(function() {
        sendRequest("GET_REQUEST", true);
    }, 200);
}

function sendRequest(request, waitAnswer) {
    try {
        var xhttp = new XMLHttpRequest();

        if (waitAnswer) {
            xhttp.onerror = function() {
                clientId = -1;
                requestId = -1;
            }
            xhttp.onreadystatechange = function() {
                if (xhttp.readyState == 4 && xhttp.status == 200 && xhttp.responseText != "NO_REQUEST") {
                    var requestParts = xhttp.responseText.split(REQUEST_SEPARATOR)

                    if (clientId == -1 || isNaN(clientId)) {
                        clientId = parseInt(xhttp.responseText);
                        return;
                    }
                    if (requestParts.lenngth < 3) {
                        return;
                    }
                    requestId = parseInt(requestParts[0]);
                    var requestType = requestParts[1];
                    var requestData = (requestParts[2]);
                    processRequest(requestType, requestData);
                }
            };
        }

        if (clientId == -1 || isNaN(clientId)) {
            clientId = -1;
            request = "GET_CLIENT_ID";
        }
        if (isNaN(requestId)) {
            requestId = -1;
        }

        xhttp.open("POST", katalonServer, true);
        xhttp.send(request + "=" + clientId + REQUEST_SEPARATOR + requestId);
    } catch (ex) {
        console.log(ex);
    }
}

function processRequest(requestType, requestData) {
    if (requestType == "FIND_TEST_OBJECT") {
        findObject(requestData);
    } else if (requestType == "HIGHLIGHT_TEST_OBJECT") {
        highlightObject(requestData);
    }
}

chrome.runtime.onMessage.addListener(function(request, sender, callback) {
    if (request.action == XHTTP_ACTION) {
        return processXHTTPAction(request, callback);
    } else if (request.action == "GET_REQUEST") {
        // startSendRequest(request);
    } else if (request.action == CHECK_ADDON_START_STATUS) {
        callback({
            runMode : runMode,
            data : runData
        })
    }
});

function waitForConnection() {
    if (clientSocket) {
        return;
    }
    tryToConnect();
}

function tryToConnect() {
    getKatalonServerPort(function(port) {
        var socketUrl = "ws://localhost:" + port + "/";
        console.log("Try to connect to Katalon Studio at " + socketUrl);
        try {
            var tempSocket = new WebSocket(socketUrl);
            tempSocket.onmessage = function(event) {
                console.log("Received message from Katalon Studio: \"" + event.data + "\"");
                handleServerMessage(event.data);
            }
            tempSocket.onopen = function(event) {
                console.log("Connected to Katalon Studio");
                clientSocket = tempSocket;
                clientSocket.onclose = function(event) {
                    console.log("Connection closed - Try to connect again...");
                    clientSocket = null;
                    stopAddon();
                    setTimeout(tryToConnect, 300);
                }
            }
            tempSocket.onerror = function(event) {
                console.log("Error Connecting - Try again...");
                setTimeout(tryToConnect, 300);
            }
        } catch (e) {
            console.log("Error Initializing - Try again... ");
            setTimeout(tryToConnect, 300);
        }

    });
}

function handleServerMessage(message) {
    if (clientSocket == null || !message) {
        return;
    }
    var jsonMessage = JSON.parse(message);
    switch (jsonMessage.command) {
    case REQUEST_BROWSER_INFO:
        console.log("Sending browser info");
        var message = {
            command : BROWSER_INFO,
            data : {
                browserName : CHROME
            }
        }
        clientSocket.send(JSON.stringify(message));
        break;
    case START_INSPECT:
        startAddon(RUN_MODE_OBJECT_SPY, jsonMessage.data);
        break;
    case START_RECORD:
        startAddon(RUN_MODE_RECORDER, jsonMessage.data);
        break;
    case HIGHLIGHT_OBJECT:
        if (!jsonMessage.data) {
            break;
        }
        highlightObject(jsonMessage.data);
        break;
    }
}

function startAddon(newRunMode, data) {
    runMode = newRunMode;
    runData = data;
    chrome.tabs.query({}, function(tabs) {
        for (i = 0; i < tabs.length; ++i) {
            chrome.tabs.sendMessage(tabs[i].id, {
                action : START_ADDON,
                runMode : newRunMode,
                data : data
            }, function() {
                // nothing here
            });
        }
    });
    focusOnWindow();
}

function setCurrentWindow() {
    chrome.windows.getCurrent(function(window) {
        curWinID = window.id;
    });
}

function focusOnWindow() {
    chrome.windows.update(curWinID, {
        focused : true
    });
}

function stopAddon() {
    runMode = RUN_MODE_IDLE;
    runData = {};
    chrome.tabs.query({}, function(tabs) {
        for (i = 0; i < tabs.length; ++i) {
            chrome.tabs.sendMessage(tabs[i].id, {
                action : STOP_ADDON
            }, function() {
                // nothing here
            });
        }
    });
}

chrome.runtime.onStartup.addListener(function() {
    setCurrentWindow();
    waitForConnection();
});

chrome.runtime.onInstalled.addListener(function(details) {
    waitForConnection();
});