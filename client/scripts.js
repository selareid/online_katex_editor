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

function getSearchDataIfAny() {
    var searchItem = window.location.search.substring(1);
    var searchData = null;

    if (searchItem) {
        try {
            var xmlHttp = new XMLHttpRequest();
            xmlHttp.open( "GET", api_url + searchItem, false ); // false for synchronous request
            xmlHttp.send( null );
            console.log(xmlHttp.responseText);
    
            searchData = xmlHttp.status == 200 ? xmlHttp.responseText : null;
        }
        catch(err) {
            console.log("Error Getting Search From Server:\n " + err);
        }
    }

    return {item: searchItem, data: searchData};
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
        xmlHttp.open( "GET", api_url + "notes/" + noteName, false ); // false for synchronous request
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

const beforeUnloadListener = (event) => {
    event.preventDefault();
    return event.returnValue = "";
  };

function trySendNoteToServer(noteName, text, statusBox) {
    upload_iterations += 1;
    addEventListener("beforeunload", beforeUnloadListener, {capture: true});

    if (lastUploadFinished) {
        let this_upload_iteration = upload_iterations;
        lastUploadFinished = false;

        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open("POST", api_url + "notes/" + noteName, true); // true for asynchronous request
        
        xmlHttp.onreadystatechange  = function () {
            lastUploadFinished = true;
            console.log("Upload Response: " + xmlHttp.responseText);

            if (statusBox) {
                statusBox.innerText = "Upload Status: " + (xmlHttp.statusText || "Failed") + "\n Sync Status: " + (xmlHttp.status === 200 && this_upload_iteration===upload_iterations);
                
                if (xmlHttp.status === 200 && this_upload_iteration === upload_iterations) {
                    removeEventListener("beforeunload", beforeUnloadListener, {capture: true});
                }
            }
        }

        xmlHttp.send(text);
    }
    else {
        if (statusBox)  statusBox.innerText = "Upload Status: Uploading\n Sync Status: ------";
    }
}

function renderOI(inputBox, inputHighlightBox, outputBox, inputWrapper) {
    renderInput(inputBox, inputHighlightBox);

    var renderSuccess = tryRenderOutput(inputBox.innerText, outputBox);
    if (renderSuccess) {
        inputWrapper.style.borderColor = '';
        document.getElementById("input_wrapper").style.height = outputBox.clientHeight + 'px';
    }
    else {
        inputWrapper.style.borderColor = 'red';
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

function renderInput(inputBox, inputHighlightBox) { //highlight input, etc
    var highlightedHTML = colorInnerHTML(inputBox.innerHTML);
    inputHighlightBox.innerHTML = highlightedHTML;
}

const startHighlight = ['\\'];
const endHighlight = ['&', ' ', '{','}','<','>','=', '_', '$', '^', '#', '%', '~'];
const slashHighlightOrange = ['#', '$', '%', '^', '_', '~', '\\'];

function colorInnerHTML(text) {
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
        else if (startPos === undefined && curChar === '\\' && newText.slice(position + 1, position + 6) === '&amp;') { // case of \& cause & is &amp; in html
            let insertTextP1 = '<span style="color:#FFA500">';
            let insertTextP2 = '</span>';

            newText = newText.slice(0, position) + insertTextP1 + curChar + newText[position + 1] + insertTextP2 + newText.slice(position + 6);

            position += 1 + insertTextP1.length + 1 + insertTextP2.length;
        }
        else if (startPos === undefined && curChar === '\\' && newText.length > position + 'color{}'.length && newText.substring(position, position+7) === '\\color{') { // case of \color{<color name>}
            // highlight the \color part
            let insertText1 = '<span style="color:#70d14d">';
            let insertText2 = '</span>';
            newText = newText.slice(0, position) + insertText1 + '\\color' + insertText2 + newText.slice(position+6);
            position += insertText1.length + insertText2.length + '\\color'.length;

            position++; // skip the {

            // highlight the <color name> in its own colour
            let i = position;
            let buffer = '';
            while (true) {
                let c = newText[i];

                if ((startHighlight.includes(c) || endHighlight.includes(c) || slashHighlightOrange.includes(c))
                 && c !== '}' && !(c === '#' && i === position && newText[position+7] === '}' || i === position && newText[position+4] === '}')) break; // special characters, except } and when color is hash code
                else if (c === '}') { // end of colour text, highlight
                    let insertText3 = '<span style="color:'+buffer+'">';
                    let insertText4 = '</span>';
                    newText = newText.slice(0, position) + insertText3 + buffer + insertText4 + newText.slice(position+buffer.length);
                    position += insertText3.length + insertText4.length + buffer.length;
                    break;
                }
                else if (c) buffer += c;
                else break; // end of text

                i++;
            }

            position++; // skip the }
        }
        else if (startPos === undefined && startHighlight.includes(curChar)) { // regular start
            let insertText = '<span style="color:#70d14d">';

            newText = newText.slice(0, position) + insertText + newText.slice(position);

            startPos = position + insertText.length;
            startChar = curChar;

            position += 1 + insertText.length;
        }
        else if (startPos !== undefined && endHighlight.includes(curChar)) { //regular end
            let insertText = '</span>';

            newText = newText.slice(0, position) + insertText + newText.slice(position);

            startPos = undefined;
            startChar = undefined;

            position += 1 + insertText.length;
        }
        else if (startPos !== undefined && position !== startPos && startHighlight.includes(curChar)) { // back to back highlighting e.g. \quad\quad
            //  - close previous highlight and processes this position again on next loop
            // done this way since going from "\quad \quad" to "\quad\quad" created inconsistent behaviour 
            // with the cursor position due to the combination of the hidden highlight html code

            let insertText = '</span>';

            newText = newText.slice(0, position) + insertText + newText.slice(position);

            startPos = undefined;
            startChar = undefined;

            position += insertText.length;
        }
        else {
            position++;
        }
    }

    //finished going through text and haven't ended the highlight
    if (startPos !== undefined) {
        newText = newText += '</span>';
    }

    return newText;
}