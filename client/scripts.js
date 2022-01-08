const api_url = "/katex_api/";

function getNoteName() {
    try {
        return /note=([^&#=]*)/.exec(window.location.search)[1];
    }
    catch(err) {
        console.log("While Getting Note Name:\n", err);
        return null;
    }
}

function storeNoteLocally(noteContents) {
    sessionStorage.setItem('katexAutosave', noteContents);
}

function getLocallyStoredNote() {
    var note = sessionStorage.getItem('katexAutosave');
    return note || null;
}

function getNoteFromServer(noteName) {
    try {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open( "GET", api_url + noteName, false ); // false for synchronous request
        xmlHttp.send( null );
        console.log(xmlHttp.responseText);

        return xmlHttp.status == 200 ? xmlHttp.responseText : null;
    }
    catch(err) {
        console.log("Error Getting Note From Server:\n " + err);
    }

    return null;
}

var lastUploadFinished = true;
var upload_iterations = 0;

function trySendNoteToServer(noteName, text, statusBox) {
    upload_iterations += 1;

    if (lastUploadFinished) {
        let this_upload_iteration = upload_iterations;
        lastUploadFinished = false;

        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open("POST", api_url + noteName, true); // true for asynchronous request
        
        xmlHttp.onreadystatechange  = function () {
            lastUploadFinished = true;
            console.log("Upload Response: " + xmlHttp.responseText);
            statusBox.innerText = "Upload Status: " + (xmlHttp.statusText || "Failed") + "\n Sync Status: " + (xmlHttp.status === 200 && this_upload_iteration===upload_iterations);
        }

        xmlHttp.send(text);
    }
    else {
        statusBox.innerText = "Upload Status: Uploading\n Sync Status: ------";
    }
}

function renderOI(text, inputBox, outputBox) {
    var renderSuccess = tryRenderOutput(text, outputBox);
    if (renderSuccess) {
        inputBox.style.height = outputBox.clientHeight + 'px';
        renderInput(inputBox);
    }
}

function tryRenderOutput(text, outputBox) { // returns whether success or not
    try {
        var html = katex.renderToString(text, {displayMode: true, trust: true});
        outputBox.innerHTML = html;
        outputBox.style.backgroundColor = '';

        return true;
    }
    catch (e) {
        if (e instanceof katex.ParseError) {
            // KaTeX can't parse the expression
            var errorString = ("Error in LaTeX '" + text + "': " + e.message)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            console.log(errorString);
            outputBox.style.backgroundColor = '#800000';

            return false;
        } else {
            throw e;  // other error
        }
    }
}

function renderInput(inputBox) { //highlight input, etc                
    var cursorPos = Cursor.getCurrentCursorPosition(inputBox);
    var newInputHTML = colorInnerHTML(inputBox.innerHTML);

    if (newInputHTML != inputBox.innerHTML) {
        inputBox.innerHTML = newInputHTML;
        Cursor.setCurrentCursorPosition(cursorPos, inputBox);
    }
}

function colorInnerHTML(text) {
    // console.log("pre " + text)

    //remove span tags from text
    text = text.replace(/(<span)[^>]*(>)/g, "");
    text = text.replace(/(<\/span>)/g, "");
    // console.log("post " + text);

    newText = '';
    state = 'zoom';
    updateI = 0;

    for (i=0;i<=text.length;i++) {
        curChar = text[i];

        switch (state) {
            case 'zoom':
                if (curChar == `\\`/* && text[i-1] != '>'*/) {
                    // console.log('foudn \ at '+i);
                    state = 'found_start';
                    newText += text.substring(updateI, i);
                    updateI = i;
                }
                else {
                    newText += text.substring(updateI, i);
                    updateI = i;
                }
                // console.log(curChar);
                break;
            case 'found_start':
                // console.log('woulda been: ' + curChar + ' ' + i + ' ' + updateI)

                if (['&', ' ', '{','}','<','>','='].includes(curChar) || i==text.length-1) { //handle end of highlight
                    newText += '<span style="color:#70d14d">' + text.substring(updateI, i) + '</span>';

                    updateI = i;
                    state = 'zoom';
                }
                else if (updateI != i && curChar=='\\') {
                    newText += '<span style="color:#70d14d">' + text.substring(updateI, i+1) + '</span>';

                    updateI = i+1;
                    state = 'zoom';
                }
                break;
        }
    }

    return newText;
}