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
            if (statusBox) statusBox.innerText = "Upload Status: " + (xmlHttp.statusText || "Failed") + "\n Sync Status: " + (xmlHttp.status === 200 && this_upload_iteration===upload_iterations);
        }

        xmlHttp.send(text);
    }
    else {
        if (statusBox)  statusBox.innerText = "Upload Status: Uploading\n Sync Status: ------";
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

const startHighlight = ['\\'];
const endHighlight = ['&', ' ', '{','}','<','>','=', '_', '$', '^', '#', '%', '~'];
const slashHighlightOrange = ['#', '$', '%', '^', '_', '~'];

function colorInnerHTML(text) {
    //remove span tags from text
    text = text.replace(/(<span)[^>]*(>)/g, "");
    text = text.replace(/(<\/span>)/g, "");

    newText = text;

    var position = 0;
    var startPos = undefined;
    var startChar = undefined;

    while (position < newText.length) {
        let curChar = newText[position];
        
        if (startPos === undefined && curChar === '\\' && slashHighlightOrange.includes(newText[position + 1])) { // case of \<orange highlight> e.g. \_
            let insertTextP1 = '<span style="color:#FFA500">';
            let insertTextP2 = '</span>';

            newText = newText.slice(0, position) + insertTextP1 + curChar + newText[position + 1] + insertTextP2 + newText.slice(position + 2);

            position += 1 + insertTextP1.length + 1 + insertTextP2.length;
        }
        else if (startPos === undefined && startHighlight.includes(curChar)) { // regular start
            let insertText = '<span style="color:#70d14d">';

            newText = newText.slice(0, position) + insertText + newText.slice(position);

            startPos = position + insertText.length;
            startChar = curChar;

            position += 1 + insertText.length;
        }
        else if (startPos !== undefined && startChar == '\\' && curChar == '\\' && startPos + 1 === position) { // case of '\\' (katex newline)
            let insertText = '</span>';

            newText = newText.slice(0, position+1) + insertText + newText.slice(position+1);

            startPos = undefined;
            startChar = undefined;

            position += 1 + insertText.length;
        }
        else if (startPos !== undefined && endHighlight.includes(curChar)) { //regular end
            let insertText = '</span>';

            newText = newText.slice(0, position) + insertText + newText.slice(position);

            startPos = undefined;
            startChar = undefined;

            position += 1 + insertText.length;
        }
        else {
            position++;
        }
    }

    return newText;
}