
let $fs = require('fs');
let iframeTimer = undefined;
const path = require("path");
import {
    resDir, contentTypeId
} from '../utils/index';

//处理 转换时间的工具
export const timeDisposeTool = {
    methods: {
        formatTime(timestamp, type) {
            var date = new Date(timestamp * 1000);//时间戳为10位需*1000，时间戳为13位的话不需乘1000
            var Y = date.getFullYear() + '-';
            var M = (date.getMonth() + 1 < 10 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1) + '-';
            var D = (date.getDate() < 10 ? '0' + date.getDate() : date.getDate()) + ' ';
            var h = (date.getHours() < 10 ? '0' + date.getHours() : date.getHours()) + ':';
            var m = (date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()) + ':';
            var s = (date.getSeconds() < 10 ? '0' + date.getSeconds() : date.getSeconds());
            if (type == 'time') {
                return h + m + s;
            } else {
                return Y + M + D + h + m + s
            }
        },

        //计算时间差（相差分钟）
        timeDifferenceMinute(beginTime, endTime) {
            var start1 = beginTime.split(":");
            var startAll = parseInt(start1[0] * 60) + parseInt(start1[1]);

            var end1 = endTime.split(":");
            var endAll = parseInt(end1[0] * 60) + parseInt(end1[1]);

            return endAll - startAll;
        },

        //现在的时间  时分秒
        getNowTime() {
            let nowTime = this.formatTime(new Date() / 1000, 'time');
            return nowTime
        },
 
        //相差多少秒 开始时间  结束时间   serverDiff  本地时间  减去 和服务器相差 秒数
        timeDifference(beginTime, endTime, serverDiff) {
            var start1 = beginTime.split(":");
            var startAll = parseInt(start1[0] * 60) + parseInt(start1[1]);
            if (!endTime) {
                return startAll * 60 + parseInt(start1[2]);
            }

            var end1 = endTime.split(":");
            var endAll = parseInt(end1[0] * 60) + parseInt(end1[1]);

            let minute = endAll - startAll;
            return minute * 60 - (parseInt(start1[2]) - parseInt(end1[2])) - (serverDiff ? this.serverTimeDiff : 0)
        },

        updateStartTime(time, duration) {
            let t = time.split(":");
            //小时
            let h = Number(t[0]);
            //分钟
            let m = Number(t[1]);
            //秒
            let s = Number(t[2]);

            //秒转换成分钟  余出来的秒数
            let remainderS = duration % 60;

            if(d > 60){
                h = h + (d - d%60) / 60;
                d = d % 60;
            }else if(d < -60){
                h = h - (Math.abs(d) - d%60) / 60;
                d = d % 60;
            }

            //秒数转为 分钟
            let d = (duration - remainderS) / 60;
            if (s + remainderS >= 60) {
                s = s + remainderS - 60;
                m = m + 1;
            } else if (s + remainderS < 0) {
                s = 60 - Math.abs(s + remainderS);
                m = m - 1;
            } else {
                s = s + remainderS;
            }
            if (m + d >= 60) {
                m = m + d - 60;
                h = h + 1;
            } else if (m + d < 0) {
                m = 60 - Math.abs(m + d);
                h = h - 1;
            } else {
                m = m + d;
            }
            return (
                this.addPreZero(h) +
                ":" +
                this.addPreZero(m) +
                ":" +
                this.addPreZero(s)
            );
        },

        //小于10 前面补个0
        addPreZero(number){
            return number < 10 ? '0' + number : number;
        },
    }
}


//播放资源
export const playResources = {
    methods: {
        getResourcesPath(gamePath) {
            const resDir = process.env.NODE_ENV === 'development' ? "static/res/" : "./dist/static/res/";
            if(!this.currentData) return;
            try {
                if (this.currentData.contentPath || this.currentData.contentTypeId == contentTypeId.game) {
                    let url = '';
                    if (this.currentData.contentTypeId == contentTypeId.game) {
                        let contentPath = this.currentData.application.screenPackage;
                        url = `${resDir}${contentPath.substring(contentPath.lastIndexOf("/", contentPath.lastIndexOf("/") - 1) + 1).replace('/', '-').split('.zip')[0]}/index.html`;
        
                    } else {
                        url = `${resDir}${this.currentData.contentPath.substring(this.currentData.contentPath.lastIndexOf("/") + 1)}`;
                    }
                    if (gamePath && url.indexOf(gamePath) < 0) return;
                    
                    if ($fs.existsSync(url)) {
                        // 播放本地资源
                        let urlPath = url.indexOf('dist/') > -1 ? url.split('dist/')[1] : url;
                        this.$set(this.currentData, 'contentPath', urlPath);

                        // 游戏资源 通过iframe 通信
                        if (this.currentData.contentTypeId == contentTypeId.game) {
                            clearTimeout(iframeTimer);
                            iframeTimer = setTimeout(() => {
                                var iframe = document.getElementById('miniview-game');
                                // iframe.onload = ()=> {   
                                let screenData = {
                                    ...this.currentData.application,
                                    screenId: this.$store.state.screenId,
                                }
                                console.log('游戏信息-------------->', screenData);
                                iframe.contentWindow.postMessage(screenData, '*');
                                // };  
                            }, 500);
                        }

                    }else if(this.currentData.contentTypeId == contentTypeId.game){
                        this.$set(this.currentData, 'contentPath', '');
                    }

                }

            } catch (error) {
                console.log(error)
            }
        }
    },
}
