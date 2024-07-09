<template>
    <div style="width: 350px; height: 100px">        
        <div class="header">
            <img src="images/icognition_logo_sidepanel.png" alt="iCognition Logo"  width="150px">
            <img class="logout_icon" src="images/icons8-logout-48.png" width="35px" alt="Logout" v-if="user !== null" @click="handleSignOut">
        </div>

        <div v-if="server_status === false" class="message_container">
            <p class="info">Connecting to server...</p>
        </div>

        <div v-if="server_status == 'down'" class="message_container">
            <p class="error">Error connecting to server</p>
        </div>

        <div v-if = "doc_status == 'ready' && user != null">
            <div class="answer_container">
                <p>{{document.is_about}}</p>
                <p>The key points are:</p>
                <ul class="" v-for="point in document.tldr">
                    <li>{{ point }}</li>
                </ul>
            </div>
        </div>

        <div v-if="server_status =='up'" class="">
            <div v-if="user === null" class="button_container">
                <label class="btn"  @click="handleSignIn">Google Sign-on</label>
            </div>

            <div v-if="user !== null" class="button_container" >
                <label class="btn" v-if = "!bookmark" @click="handleBookmark">{{ bookmark_status}}</label>
                <label class="btn" style="background-color: green" v-if="bookmark" @click="handleRegenerateDocument">{{ bookmark_status }}</label>       
            </div>
        </div>
        <div v-if="error_bookmark" class="message_container">
            <p class="error">{{ error_bookmark }}</p>
        </div>
        <div v-if="doc_status === 'processing'">
            <p class="loading">Processing...</p>
        </div>
        <a :href="library_url" target="_blank" class="">Go to iCognition Library</a>
        
        <div v-if="debug_mode" class="debug">
            <p>Server status: {{ server_status }}</p>
            <p v-if="user">User: {{ user.uid }}</p>
            <p v-if="bookmarks">Bookmarks: {{ bookmarks.length }}</p>
            <p>Document: {{ document }}</p>
            <p>Active Tab: {{ active_tab }}</p>
            <p>Error Bookmar: {{ error_bookmark }}</p>
        </div>
    </div>

        
</template>
<script setup>
import { ref, onMounted, watch } from 'vue'
import useAuth from '../composables/useAuth.js';
import { cleanUrl } from '../utils.js'

const { auth_error, user, handleSignIn, handleSignOut } = useAuth()

const bookmark = ref(null)
const bookmarks = ref([])
const server_status = ref(false)
const active_tab = ref(null)
const error_bookmark = ref(null)
const bookmark_status = ref("Add to iCognition")
const doc_status = ref(null)
const document = ref(null)
const debug_mode = ref(true)
const library_url = ref('http://localhost:8080/library')

// Send message to background.js asking if server is running
if (server_status.value === false) {
    chrome.runtime.sendMessage({ name: 'server-is' }).then((response) => {
        console.log('Sidepanel -> server-is', response)
        server_status.value = response.status
    })
}

chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
    active_tab.value = tabs[0]
})


// On popup open, check if user is logged in, if yes check for bookmarks
chrome.storage.session.get(["session_user"]).then((session_user) => {
    console.log('popup -> user_uid: ', session_user.session_user)
    if (session_user.session_user) {
        user.value = session_user.session_user
        //Check for bookmarks on open, if user is logged in
        //Note: the the if bookmark isn't found in local storage, the server will be called
        //to create a bookmark. If the bookmark exists on the server, it will be returned. 
        //This behaviour create bookmark on action button click. 
        searchBookmarksByUrl(active_tab.value.url)
    } else {
        console.log('sidepanel -> no user found in session storage!')
    }
});

watch(user, (after, before) => {
    if (after !== null) {
        console.log('User logged in! ', user.value.uid)
    }else if (after === null) {
        console.log('User logged out!')
        //Remove bookmarks from local storage
        chrome.storage.local.remove('bookmarks')
        bookmarks.value = []
    }
    
});



const checkForBookmarks = async () => {


    console.log('checkForBookmarks -> user:', user.value)
    if (user.value) {
        chrome.runtime.sendMessage({ name: 'check-for-bookmarks', tab: active_tab.value}).then((response) => {
            console.log('checkForBookmarks -> response:', response)
            if (response.bookmark.error) {
                error_bookmark.value = response.bookmark.error
            }else {
                bookmark.value = response.bookmark
                bookmark_status.value = response.bookmark ? 'Added' : 'Add to iCognition'
            }
        })
    }
}


const searchBookmarksByUrl = async (url) => {

    
    if (!user) {
        console.log('searchBookmarksByUrl -> user not authenticated')
        return
    }

    const value = await chrome.storage.local.get(["bookmarks"]);
    console.log('searchBookmarksByUrl -> value: ', value)

    if (value.bookmarks) {
        //Search local storage for bookmarks, if not found, call server
        const found = value.bookmarks.find(bookmark => bookmark.url == cleanUrl(url));
        if (!found) {
            console.log('searchBookmarksByUrl -> no bookmarks found in local storage, calling server')
            //If no bookmarks found in local storage, call server to create a bookmark, if the bookmark exists
            // on the server, it will respond with the bookmark object
            await handleBookmark()
            return
        } else {
            console.log('searchBookmarksByUrl -> found:', found)
            bookmark_status.value = 'Regenerate Summary'
            bookmark.value = found
            return
        }
    } 
    
}


watch(bookmark, (beforeBookmark, afterBookmark) => {
    console.log('Popup -> bookmark changed: ', bookmark.value.id)
    if (bookmark.value.id) {
        chrome.runtime.sendMessage({ name: 'fetch-document', bookmark_id: bookmark.value.id }).then((response) => {
            console.log('Popup -> fetch-document response:', response)
            if (response.document) {
                document.value = response.document
                doc_status.value = 'ready'
            } else {
                doc_status.value = 'processing'
            }
            
        })
    }
})

//Listen for changes in bookmarks storage and update ref accordingly
chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        console.log(
            `Storage key "${key}" in namespace "${namespace}" changed.`,
            `Old value was "${oldValue}", new value is "${newValue}".`
        );
        if (key === 'bookmarks' && namespace === 'local') {
            if (newValue === undefined) {
                bookmarks.value = []
            } else {
                bookmarks.value = newValue
            }
        }
  }
});


//Methods to handle events
const handleBookmark = async () => {
    bookmark_status.value = 'Processing'
    error_bookmark.value = null

    chrome.runtime.sendMessage({name: 'bookmark-page', tab: active_tab.value}).then((response) => {
        console.log('handleBookmark -> response:', response)

        if (response.status === 201) {
            console.log('handleBookmark -> bookmark:', response.content)
            bookmark.value = response.content
            bookmark_status.value = 'bookmark_added'
            doc_status.value = 'processing'
        } else if (response.status >= 400) {
            bookmark_status.value = 'error'
            error_bookmark.value = response.content
        } else {
            bookmark_status.value = 'no_content_found'
            error_bookmark.value = response.content
        }
    })
    return true
}

//Regenerate document
const handleRegenerateDocument = async () => {
    doc_status.value = 'processing'
    console.log('handleRegenerateDocument -> document title:', document.value.title)
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    chrome.runtime.sendMessage({
            name: 'regenerate-document', tab: tabs[0], document: document.value
        }).then((response) => {
            console.log('handleRegenerateDocument -> response:', response)
        })
}





chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
        
        if (request.name === 'error-bookmarking') {
            console.log('error-bookmarking -> request', request)
            doc_status.value = 'error'
            document.value = null
            error_bookmark.value = request.data
            sendResponse({ message: 'bookmark-page recived' })
        }
}); 

</script>