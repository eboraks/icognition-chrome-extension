<template lang="js">
    <div>
        <TabView class="h-full" @tab-change="tabClick">

            <TabPanel header="Summary">
                <div v-if="doc == null && doc.tld == null" class="pr-3 py-3" style="height: calc(100% - 49.6px);">
                    <Skeleton class='mb-2'></Skeleton>
                    <Skeleton width="5rem" class='mb-2'></Skeleton>
                </div>

                <div v-else class="flex-column w-full border-round border-2 border-blue-100 bg-white">
                    <div class="overflow-y-auto pr-3 py-3" style="height: calc(100% - 49.6px);">
                    <p class="pl-3 pb-3 line-height-2" v-if="doc != null && doc.is_about != null">{{ doc.is_about }}</p>
                    <div v-if="doc != null && doc.tldr != null">
                        <p class="pl-3">Key Points:</p>
                        <ul>
                        <li v-for="item in doc.tldr" :key="item">{{ item }}</li>
                        </ul>
                    </div>
                    </div>
                </div>
            </TabPanel>
            <TabPanel header="Ask iCongition">
                <div style="height: calc(100% - 2.75em);">
                    <div v-if="qanda_status == 'ready'">
                        <div v-for="item in qanda" :key="item.id">
                            <QuestionAnswerCard :qanda="item" :uuid="item.uuid" @remove="handleQandARemove"/>
                        </div>
                    
                        <div v-if="processing_question">
                            <div>Loading...</div>
                        </div>
                        <div v-else ref="ask_question_input" class="flex p-2 bg-white border-top-1 border-300" style="height: 2.75em;">
                            <InputText @keyup.enter="handleAsk" class="flex-grow-1 p-1" type="text" v-model="question" />
                            <Button class="flex-shrink-0 px-3 py-1 ml-1 bg-primary-500 text-white" icon="pi pi-arrow-right" @click="handleAsk" />
                        </div>
                    </div>
                
                </div>
                
            </TabPanel>
        </Tabview>
    </div>
</template>
<script setup>
import { ref, onMounted, watch } from 'vue'
import QuestionAnswerCard from './QuestionAnswerCard.vue'
import { CommunicationEnum } from '../utils.js'

const qanda = ref(null)
const qanda_status = ref(null)
const question = ref('')
const processing_question = ref(false)
const ask_question_input = ref(null)

// Define the props
const props = defineProps({
  doc: {
    type: Object,
    required: true
    }
})


onMounted(() => {
    console.log('DocSummary -> onMounted:', props.doc)
    qanda_status.value = 'loading'
    chrome.runtime.sendMessage({ name: CommunicationEnum.FETCH_QANDA, document_id: props.doc.id }).then((response) => {
        console.log('DocSummary -> fetch-qanda response:', response)
        qanda.value = response.qanda
        qanda_status.value = 'ready' 
    })
})

const tabClick = (event) => {
    console.log('DocSummary -> tabAskClick', event)

    //Click on the Ask tab, scroll to the input
    if (event.index === 1) {
        //Sleep for 1 second to allow the tab to be rendered
        setTimeout(() => {
            ask_question_input.value.scrollIntoView({ behavior: 'smooth', block: 'end' })
        }, 600)
    }
    
}

const handleQandARemove = (uuid) => {
        //call backend to remove the QandA and only then remove it from the UI
        console.log('DocSummary -> Removing QandA:', uuid);

        //Send chrome message to remove the QandA
        chrome.runtime.sendMessage({ name: CommunicationEnum.DELETE_QANDA, uuid: uuid }, function (response) {
            console.log('handle QandA Delete Response:', response);
            if (response.deleted === true) {
                qanda.value = qanda.value.filter(item => item.uuid !== uuid)
                ask_question_input.value.scrollIntoView({ behavior: 'smooth', block: 'end' })    
            }
            
        });

    }


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    console.log('DocSummary -> onMessage:', request.name)

    if (request.name === CommunicationEnum.NEW_QANDA) {
        console.log('DocSummary -> new qanda:', request)
        qanda_status.value = 'ready'
        qanda.value = JSON.parse(request.data)
        console.log('DocSummary -> qanda:', qanda.value)
    }
})



const handleAsk = () => {
    console.log('DocSummary -> handleAsk:', question.value)

    const _payload = {
        question: question.value,
        document_id: props.doc.id
    }
    processing_question.value = true
    chrome.runtime.sendMessage({ name: CommunicationEnum.ASK_QANDA, payload: _payload }).then((response) => {
        console.log('DocSummary -> ask-qanda response:', response.answer)
        qanda.value.push(response.answer)
        processing_question.value = false
        setTimeout(() => {
            ask_question_input.value.scrollIntoView({ behavior: 'smooth', block: 'end' })
        }, 200)
    })
}

</script>
<style lang="">
    
</style>