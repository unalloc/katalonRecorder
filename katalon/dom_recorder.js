//GLOBALS
var rec_hoverElement; // whatever element the mouse is over

var rec_infoDiv; // parent div to contains information
var rec_elementInfoDiv; // informational div to show xpath of current hovered element
var rec_elementInfoDivText; // xpath text to show in rec_elementInfoDiv

var rec_navigateActionRecorded = false; // flag to check if navigate action is captured
var INPUT_TYPE_INPUT_EVENT = ['email', 'number', 'password', 'search', 'tel', 'text', 'url']; // input type that will be handled by input event

function rec_setupEventListeners() {
    document.onchange = rec_change;
    document.onmouseup = rec_mouseUp;
    document.onmouseover = rec_mouseOver;
    document.onmouseout = rec_mouseOut;
    document.ondblclick = rec_dblClick;
    document.onkeydown = rec_keyDown;
    document.oninput = rec_inputChanged;
    window.onmousemove = rec_mouseMoveWindow;
    window.onmouseout = rec_mouseOutWindow;

    var selects = document.getElementsByTagName('select');
    for (i = 0; i < selects.length; i++) {
        selects[i].onfocus = rec_windowFocus;
    }
    
    if (window.addEventListener) {
        window.addEventListener("message", rec_receiveMessage, false);
    } else {
        window.attachEvent("onmessage", rec_receiveMessage);
    }
}

function rec_disposeEventListeners() {
    document.onchange = null;
    document.onmouseup = null;
    document.onmouseover = null;
    document.onmouseout = null;
    document.ondblclick = null;
    document.onkeydown = null;
    window.onmousemove = null;
    window.onmouseout = null;
    
    var forms = document.getElementsByTagName('form');
    for (i = 0; i < forms.length; i++) {
        forms[i].onsubmit = null;
    }

    var selects = document.getElementsByTagName('select');
    for (i = 0; i < selects.length; i++) {
        selects[i].onfocus = null;
    }
    
    if (window.addEventListener) {
        window.removeEventListener("message", rec_receiveMessage);
    } else {
        window.detachEvent("onmessage", rec_receiveMessage);
    }
}

function rec_addNavigationAction() {
    if (window.location !== window.parent.location) {
        return;
    }
    var action = {};
    action["actionName"] = "navigate";
    action["actionData"] = window.document.URL;
    rec_sendData(action, document);
}

// setup informational div to show which element the mouse is over.
function rec_createInfoDiv() {
    addCustomStyle();
    rec_infoDiv = document.createElement('div');
    rec_infoDiv.id = 'katalon';
    rec_createXpathDiv();
    document.body.appendChild(rec_infoDiv);
}

function rec_removeInfoDiv() {
    rec_infoDiv.parentNode.removeChild(rec_infoDiv);
    rec_infoDiv = null;
    instructionDiv = null;
    rec_elementInfoDiv = null;
    rec_elementInfoDivText = null;
}

function rec_createXpathDiv() {
    rec_elementInfoDiv = document.createElement('div');
    rec_elementInfoDiv.id = 'katalon-rec_elementInfoDiv';
    rec_elementInfoDiv.style.display = 'none'; 
    rec_infoDiv.appendChild(rec_elementInfoDiv);
}

function rec_updateInfoDiv(text) {
    if (rec_elementInfoDivText == null) {
        rec_elementInfoDivText = document.createTextNode('');
        rec_elementInfoDiv.appendChild(rec_elementInfoDivText);
    }
    rec_elementInfoDivText.nodeValue = (text);
}

function rec_mouseMoveWindow(e) {
    var y = 0;
    var windowHeight = $(window).height();
    if (e.clientY - rec_infoDiv.offsetHeight - 20 < 0) {
        y = windowHeight - rec_infoDiv.offsetHeight;
    }
    rec_infoDiv.style.top = y + 'px';
}

function rec_mouseOutWindow(e) {
    rec_mouseMoveWindow(e);
}

function rec_mouseOver(e) {
    var selectedElement = e ? e.target : window.event.srcElement;
    if (selectedElement.nodeName.toLowerCase() == 'iframe' || selectedElement.nodeName.toLowerCase() == 'frame') {
        var iframeContentWindow = selectedElement.contentWindow;
        if (iframeContentWindow) {
            iframeContentWindow.focus();
        }
    } else {
        var doc = selectedElement.ownerDocument;
        var win = doc.defaultView || doc.parentWindow;
        win.focus();
    }

    if (selectedElement == rec_hoverElement) {
        return;
    }
    rec_hoverElement = selectedElement;
    rec_hoverElement.style.outline = ELEMENT_HOVER_OUTLINE_STYLE;
    rec_elementInfoDiv.style.display = 'block'; 
    rec_updateInfoDiv(getElementInfo(rec_hoverElement));
}

function rec_mouseOut(e) {
    var selectedElement = e ? e.target : window.event.srcElement;
    if (rec_hoverElement != selectedElement) {
        return;
    }
    rec_clearHoverElement();
    rec_elementInfoDiv.style.display = 'none';
    rec_updateInfoDiv("");
}

function rec_clearHoverElement() {
    if (!rec_hoverElement) {
        return;
    }
    rec_hoverElement.style.outline = '';
    rec_hoverElement = null;
}

function rec_getSelectValues(select) {
    var result = [];
    var options = select && select.options;
    var opt;

    for (var i = 0, iLen = options.length; i < iLen; i++) {
        opt = options[i];
        if (opt.selected) {
            result.push(opt.value || opt.text);
        }
    }
    return result;
}

function rec_windowFocus(e) {
    var selectedElement = e ? e.target : window.event.srcElement;
    if (selectedElement.tagName.toLowerCase() == 'select') {
        selectedElement.oldValue = rec_getSelectValues(selectedElement);
        selectedElement.onfocus = null;
    }
}

function rec_change(e) {
    var selectedElement = e ? e.target : window.event.srcElement;
    if (!selectedElement) {
        return;
    }
    var elementTagName = selectedElement.tagName.toLowerCase();
    var elementTypeName = selectedElement.type.toLowerCase();
    var isRecorded = ((elementTagName !== 'input' && elementTagName !== 'textarea') 
            || (elementTagName == 'input' && elementTypeName != 'radio' && elementTypeName != 'checkbox' 
                && INPUT_TYPE_INPUT_EVENT.indexOf(elementTypeName) ==- -1));
    if (!isRecorded) {
        return;
    }
    checkForNavigateAction();
    var action = {};
    action["actionName"] = 'inputChange';
    if (elementTagName == 'select') {
        action["actionData"] = {};
        action["actionData"]["oldValue"] = selectedElement.oldValue
        action["actionData"]["newValue"] = rec_getSelectValues(selectedElement);
        selectedElement.oldValue = action["actionData"]["newValue"];
    } else {
        action["actionData"] = selectedElement.value;
    }
    rec_sendData(action, selectedElement);
}

function rec_getMouseButton(e) {
    if (!e) {
        return;
    }
    if (e.which) {
        if (e.which == 3) {
            return 'right';
        }
        if (e.which == 2) {
            return 'middle';
        }
        return 'left';
    }
    if (e.button) {
        if (e.button == 2) {
            return 'right';
        }
        if (e.button == 4) {
            return 'middle';
        }
        return 'left';
    }
}

function rec_isElementMouseUpEventRecordable(selectedElement, clickType) {
    if (clickType != 'left') {
        return true;
    }
    var elementTag = selectedElement.tagName.toLowerCase();
    if (elementTag == 'input') {
        var elementInputType = selectedElement.type.toLowerCase();
        if (elementInputType == 'button' || elementInputType == 'submit' || elementInputType == 'radio'
                || elementInputType == 'image' || elementInputType == 'checkbox') {
            return true;
        }
        return false;
    }
    return elementTag != 'select' && elementTag != 'option' && elementTag != 'textarea';
}

function rec_mouseUp(e) {
    var selectedElement = e ? e.target : window.event.srcElement;
    var clickType = rec_getMouseButton(e);
    if (!rec_isElementMouseUpEventRecordable(selectedElement, clickType)) {
        return;
    }
    checkForNavigateAction();
    var action = {};
    action["actionName"] = 'click';
    action["actionData"] = clickType;
    rec_sendData(action, selectedElement);
    console.log("click sent")
}

function rec_dblClick(e) {
    var selectedElement = e ? e.target : window.event.srcElement;
    checkForNavigateAction();
    var action = {};
    action["actionName"] = 'doubleClick';
    action["actionData"] = '';
    rec_sendData(action, selectedElement);
}

function rec_keyDown(e) {
    var keycode = (e) ? e.which : window.event.keyCode;
    // ENTER
    if (keycode == 13) {
        var selectedElement = e ? e.target : window.event.srcElement;
        var action = {};
        action["actionName"] = 'sendKeys';
        action["actionData"] = 13;
        rec_sendData(action, selectedElement);
    }
}

function rec_inputChanged(e) {
    var selectedElement = e ? e.target : window.event.srcElement;
    if (!selectedElement) {
        return;
    }
    var elementTagName = selectedElement.tagName.toLowerCase();
    var elementTypeName = selectedElement.type.toLowerCase();
    var isRecorded = (elementTagName === 'input' && 
            (INPUT_TYPE_INPUT_EVENT.indexOf(elementTypeName) !== -1)) 
            || (elementTagName === 'textarea');
    if (!isRecorded) {
        return;
    }
    var action = {};
    action["actionName"] = 'inputChange';
    action["actionData"] = selectedElement.value;
    rec_sendData(action, selectedElement);
}

function rec_sendData(action, element) {
    if (!element) {
        return;
    }
    var jsonObject = mapDOMForRecord(action, element, window);
    rec_processObject(jsonObject);
}

function checkForNavigateAction() {
    if (rec_navigateActionRecorded) {
        return;
    }
    rec_addNavigationAction();
    rec_navigateActionRecorded = true;
}

function rec_setParentJson(object, parentJson) {
    if ('parent' in object) {
        rec_setParentJson(object['parent'], parentJson);
    } else {
        object['parent'] = parentJson;
    }
}

function rec_postData(url, object) {
    if (!object) {
        return;
    }
    var data = 'element=' + encodeURIComponent(JSON.stringify(object));
    if (detectChrome()) {
        chromePostData(url, data, function(response) {
            if (response) {
                console.log(response)
                // error happenened
                alert(response);
                setTimeout(function() {
                    window.focus();
                }, 1);
                return;
            }
            console.log("POST success");
        });
        return;
    }
    if (detectIE() && window.httpRequestExtension) {
        var response = window.httpRequestExtension.postRequest(data, url);
        if (response === '200') {
            console.log("POST success");
        } else {
            console.log(response);
        }
        return;
    }
    self.port.emit("rec_postData", {
        url : url,
        data : object
    });
}

function rec_processObject(object) {
    if (window.location !== window.parent.location) {
        window.parent.postMessage(JSON.stringify(object), "*");
    } else {
        rec_postData(qAutomate_server_url, object);
    }
}

function rec_receiveMessage(event) {
    // Check if sender is from any child frame belong to this window
    var childFrame = null;
    var arrFrames = document.getElementsByTagName("IFRAME");
    for (var i = 0; i < arrFrames.length; i++) {
        if (arrFrames[i].contentWindow === event.source) {
            childFrame = arrFrames[i];
            break;
        }
    }
    arrFrames = document.getElementsByTagName("FRAME");
    for (var i = 0; i < arrFrames.length; i++) {
        if (arrFrames[i].contentWindow === event.source) {
            childFrame = arrFrames[i];
            break;
        }
    }
    if (!childFrame) {
        return;
    }
    var object = JSON.parse(event.data);
    var action = {};
    action["actionName"] = "goIntoFrame";
    action["actionData"] = "";
    var json = mapDOMForRecord(action, childFrame, window);
    if (json) {
        rec_setParentJson(object, json);
    }
    rec_processObject(object);
}

function startRecord() {
    rec_setupEventListeners();
    rec_createInfoDiv();

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
};


function endRecord() {
    rec_disposeEventListeners();
    rec_removeInfoDiv();
    rec_clearHoverElement();
    rec_navigateActionRecorded = false;
}
