<template>
<div class="screen-content" v-if="currentData">
    <img 
        v-if="currentData.contentTypeId==contentTypeId.image" 
        :src="currentData.contentPath"
    >
    <video 
        style="object-fit: fill;" 
        v-if="currentData.contentTypeId==contentTypeId.video" 
        width="100%" 
        height="100%" 
        :autoplay="true" 
        :loop="true" 
        :src="currentData.contentPath">
    </video>
    <iframe 
        id="miniview-game"
        v-if="currentData.contentTypeId==contentTypeId.game"
        :src="currentData.contentPath"
        style="width: 100%; height: 100%;"
        frameborder="no" border="0" scrolling="no">
    </iframe>
    </div>
</template>

<script>
let $fs = require('fs');
import {
    resDir, contentTypeId, timelinePlayType
} from '../utils/index';
import {
    timeDisposeTool,
    playResources
} from '@/mixins/index.js';
import {
    scoketId
} from '../utils/scoketId';
import { mapState } from 'vuex';

export default {
    props: {
        data: Array,
        serverTimeDiff: String
    },
    mixins: [timeDisposeTool, playResources],
    data() {
        return {
            contentTypeId: contentTypeId,
            timer: undefined, //定时器
            atlasTimer: undefined, //图集定时器
            contentDuration: 0, //当前播放的内容 时长(秒)
            currentData: undefined, //当前播放的内容
            nextPlayIndex: 0, //下一个播放的 index
            timelineData: [],
            msgTimer: undefined, //每隔五分钟发送 3003 定时器
            playEnd: false, //是否播放完一圈
        }
    },
    computed: {
        ...mapState({
            ruleType: state => state.ruleType,               //调度类型
            scheduleLoop: state => state.scheduleLoop,       //是否循环
            stepIndex: state => state.stepIndex,             //当前步骤
            stepData: state => state.stepData,
        })
    },
    created() {
        this.dataSort();
    },
    methods: {
        //时间轴排序  开始时间最早的放在前面
        dataSort() {
            let handle = false;
            this.data.sort((a, b) => {
                return this.timeDifference(a.beginTime) - this.timeDifference(b.beginTime)
            })
            // 现在到开始时间的秒数 大于 内容秒数的跳过， 正处于这个资源播放时间， 剩余秒数 = 内容秒 - 现在到开始时间的秒数
            if(this.ruleType != timelinePlayType.content){
                for (let i = 0; i < this.data.length; i++) {
                    let duration = this.timeDifference(this.data[i].beginTime, this.getNowTime(), true);
                    if (duration < this.data[i].duration) {
                        this.nextPlayIndex = i;
                        this.data[i].surplusDuration = duration > 0 ? this.data[i].duration - duration : this.data[i].duration;
                        this.init();
                        handle = true;
                        return
                    }
                }

                //表示现在时间为播放最后一个资源之后的时间， 就算为已经播放一圈，重头计算播放
                if (!handle) {
                    this.playEnd = true;
                    this.init();
                }
            }else{
                this.init();
            }

        },

        //websocket 发送消息
        socketSendMessage(data) {
            let obj = {
                ...data,
                contentId: this.currentData.contentId,
                sendTime: this.formatTime(new Date() / 1000 - this.serverTimeDiff)
            }
            this.$emit('sendMessage', obj);
        },

        init() {
            // 先清除定时
            if (this.msgTimer) clearInterval(this.msgTimer);
            if (this.atlasTimer) clearInterval(this.atlasTimer);

            //当前时段是否有要播放的内容  
            let handleContent = true;

            if (this.nowTimeFindContent()) {
                //当前要播放的内容
                this.currentData = JSON.parse(JSON.stringify(this.data[this.nextPlayIndex]));
                // 当前要播放的内容  总共多少秒  播放结束后 继续播放下一个内容
                this.contentDuration = this.data[this.nextPlayIndex].surplusDuration || this.data[this.nextPlayIndex].duration;

                //获取资源路径
                this.getResourcesPath();

                if (this.currentData.contentTypeId == 4) {
                    this.atlasPlay(0);
                }

                //资源播放时 发送 3002
                this.socketSendMessage({
                    id: scoketId.playOnce
                });

                this.timingSendMsg(5000);
            } else {
                //当前时段没有要播放的内容
                handleContent = false;
            }

            // console.log(this.nowTimeFindContent(), this.contentDuration, this.currentData)
            this.timer = setTimeout(() => {
                if(handleContent && this.nextPlayIndex + 1 >= this.data.length && this.ruleType == timelinePlayType.content && (this.scheduleLoop ? true : this.stepIndex < this.stepData.length-1)){
                    this.$store.dispatch('setStepIndex', this.currentData.beginTime+this.currentData.regionId);
                    return;
                }else if (handleContent) {
                    //播放结束时  发送 3003  isOver：1
                    this.socketSendMessage({
                        id: 3003,
                        isOver: 1
                    });
                    this.data[this.nextPlayIndex].surplusDuration = 0;

                    // 播放到最后一个内容时
                    if (this.nextPlayIndex + 1 >= this.data.length) {
                        clearTimeout(this.timer);

                        this.playEnd = true; //播放完一圈
                        this.nextPlayIndex = 0; //重头播放
                        this.currentData = {};
                    } else {
                        this.nextPlayIndex += 1;
                        this.playEnd = false;
                    }

                }
                this.init();
            }, this.contentDuration * 1000);

        },

        //清空当前资源路径
        clearCurrentPath(){
            if(this.currentData.contentTypeId == contentTypeId.game){
                this.$set(this.currentData, 'contentPath', '');
            }
        },

        //资源播放时 发送 3002 然后每隔五分钟发送一次 3003， 最后播放结束时不足五分钟也要发送 3003
        //未结束isOver:0   结束时 isOver：1
        timingSendMsg() {
            this.msgTimer = setInterval(() => {
                this.socketSendMessage({
                    id: scoketId.playPeriod,
                    isOver: 0
                });
            }, 60000 * 5);
        },

        //当前时段有没有 要播放的资源  9:30:12  9:40   10*60 - 12
        nowTimeFindContent() {
            //要播放的资源
            try {
                let handle = true;
                let data = this.data[this.nextPlayIndex];
                let duration = this.timeDifference(this.getNowTime(), data.beginTime, true);

                //调度规则为内容时  不按照正常是时间播放， 不用管第一个开始时间， 直接从第一个开始播放就行
                if(this.ruleType == timelinePlayType.content && (this.scheduleLoop ? true : !this.playEnd)){
                    let prevData = this.data[this.nextPlayIndex-1];
                    if(prevData){
                        duration = this.timeDifference(this.updateStartTime(prevData.beginTime, prevData.duration), data.beginTime);
                    }else{
                        duration = 0;
                    }
                }
    
                //播放一圈之后， 计算第一个的播放时间距离现在多少秒
                if (this.playEnd && duration < 0) {
                    duration = 24 * 60 * 60 - this.timeDifference(data.beginTime, this.getNowTime()) - this.serverTimeDiff
                }

                if (duration > 0 || (this.playEnd && duration < 0)) {
                    this.contentDuration = duration;
                    this.currentData = {};
                    handle = false;
                }
                return handle;
            } catch (error) {
                
            }
        },

        //图集播放
        atlasPlay(index = 0) {
            if (this.atlasTimer) clearInterval(this.atlasTimer);
            let obj = this.currentData.subContentsData[index];
            this.$set(this.currentData, 'contentPath', obj.contentPath);
            this.$set(this.currentData, 'contentTypeId', obj.contentType);
            let duration = obj.duration;
            this.atlasTimer = setTimeout(() => {
                index = index + 1 >= this.currentData.subContentsData.length ? 0 : index + 1;
                this.atlasPlay(index);
            }, duration * 1000);
        }
    },
    destroyed () {
        clearTimeout(this.timer) // 清除
    }
}
</script>
