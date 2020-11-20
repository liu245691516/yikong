<template>
    <div class="screen-content" v-if="currentData">
    
        <img 
            v-if="currentData.contentTypeId==contentTypeId.image && currentData.contentPath" 
            :src="currentData.contentPath"
        >
        <video 
            style="object-fit: fill;"
            v-if="currentData.contentTypeId==contentTypeId.video && !isHideVideo"
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
            frameborder="no" border="0" scrolling="no"></iframe>

    </div>
</template>
<script>
import { timeDisposeTool, playResources } from '@/mixins/index.js';
import { resDir, contentTypeId, timelinePlayType } from '../utils/index';
import { scoketId } from '../utils/scoketId';
import { mapState } from 'vuex';

export default {
    props: {
        data: Array,
        serverTimeDiff: String,
        timelineBeginTime: String,  //时间轴的开始时间
        timelineEndTime: String,    //时间轴的结束时间
    },
    mixins: [timeDisposeTool, playResources],
    data(){
        return {
            contentTypeId: contentTypeId,
            timer: undefined,              //定时器
            atlasTimer: undefined,         //图集定时器
            contentDuration: 0,            //当前播放的内容 时长(秒)
            currentData: undefined,        //当前播放的内容
            nextPlayIndex: 0,              //下一个播放的 index
            timelineData: [],
            msgTimer: undefined,           //每隔五分钟发送 3003 定时器
            isHideVideo: false,            //是否显示视频资源   游戏开始的时候 关闭所有视频 (视频声音会和游戏声音重叠)
        }
    },
    computed: {
        ...mapState({
            stepIndex: state => state.stepIndex,             //当前步骤
            stepData: state => state.stepData,
        })
    },
    created () {
        this.dataSort();
    },
    methods: {
        //时间轴排序  开始时间最早的放在前面
        dataSort(){
            if(!this.data.timelineSteps.length) return;
            this.timelineData = JSON.parse(JSON.stringify(this.data.timelineContents));
            let totalDuration = this.data.totalDuration;

            this.$nextTick(() =>{
                this.loopPlay();
            })
        },  

        //websocket 发送消息
        socketSendMessage(data){
            if(!this.currentData.contentId) return
            let obj = {
                ...data,
                contentId: this.currentData.contentId,
                sendTime: this.formatTime(new Date() / 1000 - this.serverTimeDiff)
            }
            this.$emit('sendMessage', obj);
        },

        loopPlay(data){
            // 先清除定时
            if(this.msgTimer) clearInterval(this.msgTimer);
            if(this.atlasTimer) clearInterval(this.atlasTimer);
            if(this.timer) clearInterval(this.timer);

            //当前要播放的内容
            this.currentData = JSON.parse(JSON.stringify(this.timelineData[this.nextPlayIndex]));
            
            this.nowTimeFindContent();
            // 当前要播放的内容  总共多少秒  播放结束后 继续播放下一个内容
            this.contentDuration = this.currentData.surplusDuration || this.currentData.duration;

            //图集内容
            if(this.currentData.contentTypeId == contentTypeId.atlas){
                this.atlasPlay(0);
            }

            //播放游戏时  把其他视频资源关闭
            if(this.currentData.contentTypeId == contentTypeId.game){
                this.$emit('hideVideo', 1);
            }


            //获取资源路径
            this.getResourcesPath();

            //资源播放时 发送 3002
            this.socketSendMessage({ id: scoketId.playOnce });
            
            this.timingSendMsg(5000);
        
            this.timer = setTimeout(() => {
                //游戏播放结束时  把其他视频资源打开
                if(this.currentData.contentTypeId == contentTypeId.game){
                    this.$emit('hideVideo', 0);
                }

                if(!this.timelineData.length) {
                    this.currentData = {};
                    this.contentDuration = 0;
                    console.log('播放结束')
                    return;
                }

                //播放结束时  发送 3003  isOver：1
                this.socketSendMessage({ id: 3003, isOver: 1});
                this.timelineData[this.nextPlayIndex].surplusDuration = 0;
                

                // 播放到最后一个内容时
                if(this.nextPlayIndex + 1 >= this.timelineData.length && this.stepData.length>1){
                    console.log('播放结束--------》', this.currentData.contentPath)
                    this.$store.dispatch('setStepIndex', this.currentData.beginTime+this.currentData.regionId);
                    // this.endPlay();
                    return
                }else if(this.nextPlayIndex + 1 >= this.timelineData.length) {
                    this.nextPlayIndex = 0;
                }else{
                    if(this.currentData.neglect) {
                        this.timelineData.splice(this.nextPlayIndex, 1);
                    }else{
                        this.nextPlayIndex += 1;
                    }
                }

                //播放结束
                if(this.currentData.isEnd){
                    this.endPlay();
                    return
                }

                this.loopPlay();
            }, this.contentDuration * 1000);

        },

        //清空当前 游戏 资源路径
        clearCurrentPath(){
            if(this.currentData.contentTypeId == contentTypeId.game){
                this.$set(this.currentData, 'contentPath', '');
            }
        },

        //资源播放时 发送 3002 然后每隔五分钟发送一次 3003， 最后播放结束时不足五分钟也要发送 3003
        //未结束isOver:0   结束时 isOver：1
        timingSendMsg(){
            this.msgTimer = setInterval(() => {
                this.socketSendMessage({ id: scoketId.playPeriod, isOver: 0});
            }, 60000 * 5);
        },

        //空白区域的开始时间
        emptyStartTime(time, duration){
            let t = time.split(":");
            //小时
            let h = Number(t[0]);
            //分钟
            let m = Number(t[1]);
            //秒
            let s = Number(t[2]);

            //秒转换成分钟  余出来的秒数
            let remainderS = duration % 60;

            //秒数转为 分钟
            let d = (duration - remainderS) / 60;
            if(s + remainderS >= 60){
                s = s + remainderS - 60;
                m = m + 1;
            }else{
                s = s + remainderS;
            }
            if(m + d >= 60){
                m =  m + d - 60;
                h = h + 1;
            }else {
                m = m + d;
            }
            return this.addPreZero(h) + ":" + this.addPreZero(m) + ':' + this.addPreZero(s);
        },

        //当前内容播放完的时间 是否大于等于 时间轴的结束时间。 
        nowTimeFindContent(){  
            if(this.currentData.neglect) return
            try {
                let data = this.currentData;
                let duration = this.timeDifference(this.timelineBeginTime, this.getNowTime(), true) + Number(data.duration);
                if(duration >= this.timeDifference(this.timelineBeginTime, this.timelineEndTime)){
                    this.currentData.surplusDuration = this.timeDifference(this.getNowTime(), this.timelineEndTime, true)
                    // 播放结束
                    this.currentData.isEnd = true;
                }
            } catch (error) {
                console.log(error)
            }
        },

        //图集播放
        atlasPlay(index=0){
            if(this.atlasTimer) clearInterval(this.atlasTimer);
            let obj = this.currentData.subContentsData[index];
            this.$set(this.currentData, 'contentPath', obj.contentPath);
            this.$set(this.currentData, 'contentTypeId', obj.contentType);
            let duration = obj.duration;
            this.atlasTimer = setTimeout(() => {
                index = index + 1 >= this.currentData.subContentsData.length ? 0 : index + 1;
                this.atlasPlay(index);
            }, duration * 1000);
        },

        //播放结束
        endPlay(){
            this.nextPlayIndex = 0;
            this.currentData = {};
            if(this.msgTimer) clearInterval(this.msgTimer);
            if(this.atlasTimer) clearInterval(this.atlasTimer);

            // 初始化
            this.dataSort();
        },

        closeVideo(status){
            this.isHideVideo = status ? true : false;
        }
    },
    destroyed () {
        clearTimeout(this.timer) // 清除
        clearTimeout(this.msgTimer);
        
    }
}

</script>