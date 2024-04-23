<template>
    <div>
        
        <div class="header">
            <img src="images/icognition_logo_sidepanel.png" alt="iCognition Logo"  width="150px">
            <img class="logout_icon" src="images/icons8-logout-48.png" width="35px" alt="Logout" v-if="user !== null" @click="handleSignOut">

            <!-- <a target="_blank" href="https://icons8.com/icon/TmshBLOFvt3H/logout-rounded">Logout</a> icon by <a target="_blank" href="https://icons8.com">Icons8</a> 
            <label class="btn" v-if="user !== null" @click="signOut">{{ user.displayName }}</label>
            
            -->
        </div>

        <div class="controls">
            <div v-if="user === null" class="button_container">
                <label class="btn"  @click="handleSignIn">Sign to Google</label>
            </div>

            <div v-else class="button_container" >
                <label class="btn" v-if = "!document" @click="handleBookmark">Bookmark</label>
                <label class="btn" v-if = "doc_status == 'Done'" @click="handleRegenerateDocument">Regenerate</label>
                <label class="btn" v-if = "doc_status.includes('Failure')" @click="handleRegenerateDocument">Regenerate</label>       
            </div>
        </div>

        <div class="container">
            <div v-if = "error_message !== null" class="warning">{{ error_message }}</div>
            <div v-if = "doc_status === 'loading' && user !== null" class="loading"><p>Loading...</p></div>
        </div>


        <div v-if = "doc_status === 'Done' && user !== null">
            <div class="answer_container fade-in-text">
                <p>{{document.is_about}}</p>
                <p>The key points are:</p>
                <ul class="" v-for="point in document.tldr">
                    <li>{{ point }}</li>
                </ul>
            </div>
            
        </div>


        <div class="debug">
            <p> the doc status is: {{ doc_status }} 
                document is: {{ document !== null}} 
                server status {{  server_status }}
            </p>
        </div>
    </div>

        
</template>
<script setup>
import { watch, ref} from 'vue'
import { cleanUrl, } from '../utils.js'
import useAuth from '../composables/auth.js'

const { user, handleSignIn, handleSignOut } = useAuth()


const doc_status = ref('Placeholder')
const document = ref(null)
const error_message = ref(null)
const server_status = ref(null)
const active_tab = ref(null)
const answer = ref('')

const handleServerStatus = async () => {
    chrome.runtime.sendMessage({ name: 'server-is' }).then((response) => {
        console.log('Sidepanel -> server-is', response)
        server_status.value = response.status
    })
}


// Check if user is signed and stored in sesssion storage
chrome.storage.session.get(["session_user"]).then((session_user) => {
    console.log('sidepanel -> user_uid: ', session_user.session_user)
    if (session_user.session_user) {
        user.value = session_user.session_user
    } else {
        console.log('sidepanel -> no user found in session storage!')
    }
});

const refreshBookmarks = async (user_id) => {
    chrome.runtime.sendMessage({ name: 'refresh-bookmarks', user_id: user_id }).then((response) => {
        console.log('Sidepanel -> refresh-bookmarks', response)
    })
};

watch(user, async (before, after) => { 
    if (user.value.uid !== null) {
        await refreshBookmarks(user.value.uid)
    }
});



//Methods to handle events
const handleBookmark = async () => {
    doc_status.value = 'loading'
    error_message.value = null
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    active_tab.value = tabs[0]
    chrome.runtime.sendMessage({
        name: 'bookmark-page', tab: active_tab.value
    }).then((response) => {
        console.log('handleBookmark -> response:', response)
    })
}

// Request document from the server
const handleRequestDocument = async (bookmark_obj) => {
    doc_status.value = 'loading'
    
    chrome.runtime.sendMessage({
        name: 'request-document', bookmark: bookmark_obj
    }).then((response) => {
        console.log('handleRequestDocument -> response:', response)
    })
}


//Regenerate document
const handleRegenerateDocument = async () => {
    doc_status.value = 'loading'
    console.log('handleRegenerateDocument -> document title:', document.value.title)
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    chrome.runtime.sendMessage({
            name: 'regenerate-document', tab: tabs[0], document: document.value
        }).then((response) => {
            console.log('handleRegenerateDocument -> response:', response)
        })
}


//Searach chorome storage for bookmarks by url
const searchBookmarksByUrl = (tab, sidepanelopen) => {
    
    document.value = null
    chrome.storage.local.get(["bookmarks"]).then((value) => {

        //If value is empty, return
        if (Object.keys(value).length === 0 && value.constructor === Object) {
            console.log('searchBookmarksByUrl -> bookmarks is empty')
            return
        }
        const url = cleanUrl(tab.url)
        console.log('searchBookmarksByUrl -> url:', url)
        const exist = value.bookmarks.find(bookmark => bookmark.url === url)

        if (exist) {
            console.log('searchBookmarksByUrl -> bookmark found', exist)
            handleRequestDocument(exist)
        } else {
            console.log('searchBookmarksByUrl -> bookmark not found')
            document.value = null
            doc_status.value = 'Placeholder'
            if(sidepanelopen) {
                handleBookmark()
            }
        }

    });
}

        // On sidepanel open, find the current tab and search for bookmarks.
        // If bookmark found, show the document, less create a new bookmark
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {

            active_tab.value = tabs[0]
            const url = cleanUrl(tabs[0].url)
            console.log('Sidepanel -> tabs.query', url)
            searchBookmarksByUrl(url, true)
        });


        
        // Detect changes in active tab and navigation between tabs
        chrome.tabs.onActivated.addListener(async (activeInfo) => { 
            console.log('Sidepanel -> tabs.onActivated', activeInfo.tabId)
            chrome.tabs.get(activeInfo.tabId).then((tab) => {
                error_message.value = null
                console.log('Sidepanel -> tabs.onActivated: ', tab.url)
                active_tab.value = tab
                searchBookmarksByUrl(tab)
            })
        });
        // Detect tab refresh
        chrome.tabs.onUpdated.addListener(function (tabId , info) {
            if (info.status === 'complete') {
                error_message.value = null
                console.log('Sidepanel -> tabs.onUpdated', tabId)
                chrome.tabs.get(tabId).then((tab) => {
                    console.log('Sidepanel -> tabs.onUpdated: ', tab.url)
                    active_tab.value = tab
                    searchBookmarksByUrl(tab)
                })
            }
        });

       
chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
        
        if (request.name === 'render-document') {

            error_message.value = null
            document.value = request.data
            answer.value = document.value.is_about
            doc_status.value = document.value.status

            if (document.value.url !== cleanUrl(active_tab.value.url)) {
                console.log('render document -> document.url !== active_tab.url')
                return
            }

            console.log('Render document: ', document.value)
            sendResponse({ message: 'document recived' })
        }
        if (request.name === 'error-bookmarking') {
            console.log('error-bookmarking -> request', request)
            doc_status.value = 'error'
            document.value = null
            error_message.value = request.data
            sendResponse({ message: 'bookmark-page recived' })
        }
}); 
       
</script>

<style scoped>
.fade-in-text {
  font-family: Arial;
  font-variant: normal;
  font-size: 17px;
  animation: fadeIn 5s;
}

@keyframes fadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

.loading p {
  animation: typing 2s steps(1, end) infinite;
  overflow: hidden;
  display: inline-block;
  width: 7ch;
  white-space: nowrap; 
}

@keyframes typing {
  0% { width: 7ch }
  25% { width: 8ch }
  50% { width: 9ch }
  75% { width: 10ch }
  100% { width: 10ch }
}

.loading {
  margin: 50px;
  padding: 10px;
  width: 200px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 20px;
}
</style>