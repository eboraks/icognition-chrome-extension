import { ref, onMounted, watch } from 'vue'
import { cleanUrl, CommunicationEnum } from './utils.js'

const user = ref(null)
const socket = ref(null)

const base_url = process.env.MIX_BASE_URL // 'https://icognition-api-scv-mheo5yycwa-uc.a.run.app' //'http://localhost:8889'
console.log('base_url: ', base_url)

const Endpoints = {
    ping: '/ping',
    bookmark: '/bookmark',
    regenrate: '/document/regenerate',
    document_plus: '/document_plus/{ID}',
    user_bookmarks: '/bookmarks/user/{ID}',
    user_bookmark: '/bookmark/user',
    qanda: '/document/{id}/questions_answers',
    ask_question: '/ask_question',
    delete_qanda: '/question_answer/{uuid}',
}

// Listen to changes in storage and if session_user changes, refresh the bookmarks cache, or delete the cache if the user logs out
chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        
        // Listen to update to session_user (login) to refresh the bookmarks cache
        if (key === 'session_user') {

            if (newValue === undefined) {
                console.log("Detected user logout: ", newValue)
                chrome.storage.local.remove('bookmarks')
            } else if (newValue !== undefined && oldValue === undefined) {
                console.log("Detected user login: ", newValue)
                user.value = newValue
                refreshBookmarksCache(user.value.uid)
                registerWebSocketConnection()
            }
        }
    }
});



const registerWebSocketConnection = async () => {

    const store = await chrome.storage.session.get(["session_user"])
    if (store.session_user === undefined) {
        console.log('registerWebSocketConnection -> user is null')
        return
    }

    // Check if socket is open
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        console.log('WebSocket is already open')
        return
    }



    try {
        const ws_url = `${base_url}/ws/${store.session_user.uid}/extension`
        socket.value = new WebSocket(ws_url)
        console.log('WebSocket connection opened:', ws_url)
        socket.value.onopen = () => {
            console.log('WebSocket connection opened:', ws_url)
        }
    } catch (error) {
        console.info('Store session user:', store.session_user)
        console.error('Error opening WebSocket connection:', error)
    }

    socket.value.onmessage = (event) => {
        console.log('WebSocket message received:', event.data)
        try {
            const message = JSON.parse(event.data)
            
            if (message.type === 'document') {
                console.log('WebSocket message document:', message.type, message.document_id)
                
                //Send message to side panel to render document
                chrome.runtime.sendMessage({
                    name: CommunicationEnum.NEW_DOC,
                    data: message.data,
                }).then((response) => {
                    console.log('render-document response: ', response)
                })
            }

            if (message.type === 'doc_qanda') {
                console.log('WebSocket message doc_qanda:', message.type, message.data)
                
                //Send message to side panel to render document
                chrome.runtime.sendMessage({
                    name: CommunicationEnum.NEW_QANDA,
                    data: message.data,
                }).then((response) => {
                    console.log('questiona and answers response: ', response)
                })

            }

            if (message.type === 'document_in_progress') {
                console.log('WebSocket message document in progress:', message.type, message.data)
                storeBookmarks(message.data)
            }

            if (message.type === 'document_error') {
                console.log('WebSocket message document error:', message.type, message.data)
                storeBookmarks(message.data)
            }
            if (message.type === CommunicationEnum.PROGRESS_PERCENTAGE) {
                console.log('WebSocket message processing_percentage:', message.type, message.data)
                chrome.runtime.sendMessage({
                    name: CommunicationEnum.PROGRESS_PERCENTAGE,
                    data: message.data,
                }).then((response) => {
                    console.log('processing_percentage response: ', response)
                })
            }

        } catch (error) {
            console.error('Error parsing WebSocket message:', error)
        }

        
    }

    socket.value.onerror = (error) => {
        console.error('WebSocket error:', error)
    }

    socket.value.onclose = (event) => {
        console.log('WebSocket connection closed:', event)
    }
}

//Check if socket is open
function isWebSocketOpen() {

    console.log('isWebSocketOpen -> socket: ', socket.value)
    if (socket.value === null) {
        return false
    }

    if (socket.value.readyState === WebSocket.OPEN) {
        return true
    }
    return false
}



// Create a bookmark
async function postBookmark(tab){
    
    let bookmark = null
    let bm_error = null
    let html = null

    if (isWebSocketOpen() === false) {
        console.log('postBookmark -> WebSocket is not open')
        registerWebSocketConnection()
    }

    const session_user = await chrome.storage.session.get(["session_user"])
    console.log('postBookmark -> user: ', session_user.session_user)


    //If no authproof, return error
    if (!session_user.session_user) {
        bm_error = 'User not authenticated'
        return {bookmark, error: bm_error}
    }

    function getBody() { return document.documentElement.innerHTML; }


    try {
        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: false },
            func: getBody,
        });

        if (injectionResults[0].result != null) {
            console.log('postBookmark -> HTML recieved from content script')
            html = injectionResults[0].result
        }
    } catch (error) {
        //If error, log error and continue without the html
        console.log('postBookmark error executing script: ', error)
    }
    

    try {
        let response = await fetch(`${base_url}${Endpoints.bookmark}`, {
            method: 'post',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: tab.url,
                html: html, 
                user_id: session_user.session_user.uid
            }),
        })
        const _content = await response.json()
        return { status: response.status, content: _content }
    }
    catch (err) {
        return {status: 500, content: err}
    }
}

// Regenerate a document (this is used when the document failed to generate on the first attempt)
async function postRegenerateDocument(document){

    console.log('postRegenerateDocument -> document: ', document)
    //Fetch post with request.document
    try {
        let response = await fetch(`${base_url}${Endpoints.regenrate}`, {
            method: 'post',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(document),
        })
        
        console.log('postRegenerateDocument -> response: ', response)
        if (response.status == 202) {
            let bookmark = await response.json()
            console.log(`postRegenerateDocument accepted, seding bookmark_id ${bookmark.id} to renderDocument`)
            renderDocument(bookmark.id)
        }
    }catch (err) {
        console.log('postRegenerateDocument -> error: ', err)
    }

    
}

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

// Source: https://dev.to/ycmjason/javascript-fetch-retry-upon-failure-3p6g
async function fetch_retry(url, options, n) {
    try {
        const response = await fetch(url, options);
        console.log('fetch_retry -> attempts: ', n, ' url: ', url)
        if (response.status == 206 && n > 1) {
            await sleep(1500);
            console.log('fetch_retry -> retrying attempts: ', n, ' url: ', url)
            return fetch_retry(url, options, n - 1);
        } else if (response.status == 206 && n == 1) {
            throw new Error('Failed to fetch: ' + url);
        }
        else {
            return response.json();
        }
    } catch (error) {
        throw error;
    }
}

const searchServerBookmarksByUrl = async (user_id, url) => {
    try {
        let response = await fetch(`${base_url}${Endpoints.user_bookmark}`, {
            method: 'post',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: url,
                html: "",
                user_id: user_id
            }),
        })
        console.log('searchServerBookmarkByUrl -> response: ', response)
        if (response.status == 404) {
            const bm_error = await response.json()
            console.log('searchServerBookmarkByUrl -> error: ', bm_error)
            return { bookmark: undefined, error: bm_error }
        }
        if (response.status == 200) {
            const _bookmark = await response.json()
            console.log('searchServerBookmarkByUrl -> success: ', bookmark)
            return { bookmark: _bookmark, error: null }
        }
    }
    catch (err) {
        return { bookmark, error: err }
    }
}




function refreshBookmarksCache(user_uid) {
    let attempts = 3
    const url = `${base_url}${Endpoints.user_bookmarks.replace('{ID}', user_uid)}`
    const options = { method: 'GET', headers: {'Accept': 'application/json','Content-Type': 'application/json',}}

    fetch_retry(url, options, attempts).then(async (bookmarks) => {
        console.log('refreshBookmarksCache -> response: ', bookmarks)

        //Clear the local storage before storing the bookmarks
        await chrome.storage.local.clear()
        storeBookmarks(bookmarks)
    }).catch((error) => {
        console.log('refreshBookmarksCache -> error: ', error)
        throw error
    })
}

const fetchDocument = async (bookmark_id) => {
    let attempts = 30
    const url = `${base_url}${Endpoints.document_plus.replace('{ID}', bookmark_id)}`
    const options = { method: 'GET', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', } }
    
    try {
        const document = await fetch_retry(url, options, attempts)
        return document
    } catch (error){
        console.log('fetchDocument -> error: ', error)
        return null
    }

}

const fetchQandA = async (document_id) => {

    let attempts = 3
    const url = `${base_url}${Endpoints.qanda.replace('{id}', document_id)}`
    const options = { method: 'GET', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', } }

    try {
        const qanda = await fetch_retry(url, options, attempts)
        return qanda
    } catch (error) {
        console.log('fetchQandA -> error: ', error)
        return null
    }
}

const fetchAskQuestion = async (payload) => {

    let attempts = 3
    const url = `${base_url}${Endpoints.ask_question}`
    const options = { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', }, body: JSON.stringify(payload) }

    try {
        const response = await fetch_retry(url, options, attempts)
        return response
    } catch (error) {
        console.log('fetchAskQuestion -> error: ', error)
        return null
    }
}

const fetchDeleteQandA = async (uuid) => {
    try {
        const url = `${base_url}${Endpoints.delete_qanda.replace('{uuid}', uuid)}`
        const res = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) {
            throw Error('Could not fetch the data for that resource');
        }
        return true;
    } catch (err) {
        throw Error("Error deleting question answer ", err);
    }
}


// Listen from popup to fetch document
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.name === 'fetch-document') {
        console.log('background.js got message. Fetch Document for bookmark_id: ', request.bookmark_id)
        fetchDocument(request.bookmark_id).then((doc) => {
            console.log('fetchDocument -> response: ', doc)
            sendResponse({ document: doc })
        })
        return true
    }
    else if (request.name === CommunicationEnum.FETCH_QANDA) {
        console.log('background.js got message. Fetch QandA for document_id: ', request.document_id)
        fetchQandA(request.document_id).then((_qanda) => {
            console.log('fetchQandA -> response: ', _qanda)
            sendResponse({ qanda: _qanda })
        })
        return true
    }
    else if (request.name === CommunicationEnum.ASK_QANDA) {
        console.log('WebSocket message ask_qanda:', request.payload)
        
        fetchAskQuestion(request.payload).then((response) => {
            console.log('fetchAskQuestion response: ', response)
            sendResponse({ answer: response })    
        }).catch((error) => {
            console.log('fetchAskQuestion error: ', error)
            sendResponse({ answer: error })    
        })
        return true
    }
    else if (request.name === CommunicationEnum.DELETE_QANDA) {
        console.log('WebSocket message delete_qanda:', request.uuid)
        
        fetchDeleteQandA(request.uuid).then((response) => {
            console.log('fetchDeleteQandA response: ', response)
            sendResponse({ deleted: response })    
        }).catch((error) => {
            console.log('fetchDeleteQandA error: ', error)
            sendResponse({ deleted: error })    
        })
        return true
    }
    else {
        console.log('background.js got message. Unknown request: ', request, " from: ", sender)
    }

    
    

})




function renderDocument(bookmark_id) {
    /*
    * Fetch document from server with a retry fetch.
    * The reason for the retry fetch is that the server may not have the document ready while
    * LLM is still processing the document.
    * Send document to side panel to render. 
    */
    
    let attempts = 30
    const url = `${base_url}${Endpoints.document_plus.replace('{ID}', bookmark_id)}`
    const options = { method: 'GET', headers: {'Accept': 'application/json','Content-Type': 'application/json',}}

    fetch_retry(url, options, attempts).then((document) => {
        console.log('getDocument -> response: ', document)
        console.timeEnd('getDocument')
        sendDocumentToSidePanel(document).then((response) => {          
            console.log('renderDocument -> response: ', response)
        })     
    })
    .catch((error) => {
        console.log('getDocument -> error: ', error)
        renderError(error)
    })
}

const renderError = (error) => {

    chrome.runtime.sendMessage({
        name: 'error-bookmarking',
        data: error,
    }).then((response) => {
        console.log('error-bookmarking response: ', response)
    })

}


async function sendDocumentToSidePanel(document) {
    
    // Send message to side panel to render bookmark
    try {
        let response = await chrome.runtime.sendMessage({
            name: 'render-document',
            data: document,
        })
        return response
    } catch (error) {
        console.log(`Render Bookmark, error sending message ${error}`)
    }
}

 
async function storeBookmarks(new_bookmarks) { 
    
    if (!Array.isArray(new_bookmarks)) new_bookmarks = [new_bookmarks]
    
    chrome.storage.local.get(["bookmarks"]).then((value) => {
        let bkmks = value.bookmarks || [];
        bkmks = Array.from(new Set([...bkmks, ...new_bookmarks]));
        chrome.storage.local.set({ bookmarks: bkmks }).then(() => {
            console.log("Bookmarks storage updated", bkmks);
        });
    });  // chrome.storage.local.set({ 'https://www.thecurrent.com/what-the-tech-open-internet': 'something to store'})
}




async function searchBookmarksByUrl(url) {

    const session_user = await chrome.storage.session.get(["session_user"])
    if (!session_user.session_user) return console.log('searchBookmarksByUrl -> user not authenticated')

    console.log('searchBookmarksByUrl -> user: ', session_user)
    const value = await chrome.storage.local.get(["bookmarks"]);
    console.log('searchBookmarksByUrl -> value: ', value)

    if (value.bookmarks) {
        value.bookmarks = value.bookmarks.filter(bookmark => bookmark !== null && bookmark !== undefined);
    }

    if (!value.bookmarks) {
        console.log('searchBookmarksByUrl -> no bookmarks found in local storage, calling server')
        const bookmark = await searchServerBookmarksByUrl(session_user.session_user.uid, url)
        return bookmark
    } else {
        const found = value.bookmarks.find(bookmark => bookmark.url == cleanUrl(url));
        return found
    }
}

const badgeOn = (tabId) => {
    chrome.action.setBadgeBackgroundColor(
        {color: 'rgba(22, 169, 32, 1)'},  // Also green
        () => { /* ... */ },
    );     
    chrome.action.setBadgeText({ text: '✔' , tabId: tabId });
}

const badgeOff = (tabId) => {
    console.log('badgeOff -> tabId: ', tabId)
    chrome.action.setBadgeText({ text: null , tabId: tabId });
}

const badgeToggle = async (tab) => {
    
    console.log('badgeToggle -> url: ', tab.url)
    const bookmark = await searchBookmarksByUrl(tab.url)
    if (bookmark != undefined) {
        console.log('badgeToggle -> bookmark found: ', bookmark)
        badgeOn(tab.tabId)
    } else {
        console.log('badgeToggle -> bookmark not found')
        badgeOff(tab.tabId)
    }
}


// Detect changes in active tab
chrome.tabs.onActivated.addListener(async (tab) => { 

    console.log('tabs.onActivated', tab.tabId)

    chrome.tabs.get(tab.tabId, async (tab) => {
        console.log('tabs.onActivated -> get tab -> url: ', tab.url)
        badgeToggle(tab)
    })

    
});


chrome.tabs.onUpdated.addListener(function (tabId , info) {
    if (info.status === 'complete') {
        
        chrome.tabs.get(tabId, async (tab) => {
            console.log('tabs.onUpdated -> get tab -> url: ', tab.url)
            badgeToggle(tab)
        })
    }
});



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { 
    if (request.name === 'server-is') {
        console.log('background.js got message. Server is')
        fetch_retry(`${base_url}/ping`, { method: 'GET', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', } }, 3)
            .then((response) => {
                registerWebSocketConnection()
                console.log('background.js got message. Server response: ', response)
                sendResponse({ status: 'up' })

            }).catch((error) => {
                console.log('background.js got message. Server error: ', error)
                sendResponse({ status: 'down' })
            })
        return true
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.name === 'check-for-bookmarks') {
        
        console.log('popup-opened -> query for active tab id:', request.tab.id, ' -> url: ', request.tab.url)
        searchBookmarksByUrl(request.tab.url).then((bookmark) => {
            if (bookmark != undefined) {
                console.log('popup-opened -> found: ', bookmark)
                sendResponse({ bookmark: bookmark })
            } else {
                console.log('popup-opened -> bookmark not found')
            }
        })
        
    }

});

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {    
        
        // Handle message from sipde panel
        if (request.name === 'bookmark-page') {
            console.log('background.js got message. Bookmark Page for url: ', request.tab.url)
                
                postBookmark(request.tab).then((result) => {
                    
                    console.log('background.js postBookmark Results: ', result.status, ' -> ', result.content)
                    sendResponse({ status: result.status , content: result.content })
                })
            return true            
        }

    });


chrome.runtime.onInstalled.addListener(() => {
    // Open sidepanel on action button click
    
    
    // Initialize bookmark local storage
    chrome.storage.local.clear(function() {
        var error = chrome.runtime.lastError;
        if (error) {
            console.error(error);
        }
    });
    

}) 