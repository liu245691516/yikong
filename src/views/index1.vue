<template>
    <div class="main">
        <login
            ref="login"
            v-if="!loginSuccess"
            @loginClick="login"
            :loginError="loginError"
        ></login>
        <div class="xfj-screen" v-if="reFresh && loginSuccess">
            <div
                v-for="(item, index) in resData.regions"
                :key="index"
                class="screen-item"
                :style="{
                    top: parseInt(item.y * ratioH) + 'px',
                    left: parseInt(item.x * ratioW) + 'px',
                    width: parseInt(item.width * ratioW) + 'px',
                    height: parseInt(item.hight * ratioH) + 'px',
                    zIndex: item.layer,
                }"
            >
                <!-- 按时间轴 时间播放 -->
                <screen-item
                    v-if="
                        !item.isRotation &&
                        (currentStepRegionId.length
                            ? currentStepRegionId.includes(item.regionId)
                            : true)
                    "
                    :data="item.timeline"
                    ref="playItem"
                    @sendMessage="websocketSendData"
                    :serverTimeDiff="serverTimeDiff"
                ></screen-item>

                <!-- 循环播放 -->
                <loop-play
                    v-if="
                        item.isRotation &&
                        (currentStepRegionId.length
                            ? currentStepRegionId.includes(item.regionId)
                            : true)
                    "
                    :data="item.timeline"
                    @hideVideo="hideVideo"
                    ref="playItem"
                    :finalTime="finalTime"
                    :finalTimeDuration="finalTimeDuration"
                    :timelineBeginTime="resData.beginTime"
                    :timelineEndTime="resData.endTime"
                    @sendMessage="websocketSendData"
                    :serverTimeDiff="serverTimeDiff"
                ></loop-play>
            </div>
        </div>
    </div>
</template>
<script>
//获取当前窗口
var win = nw.Window.get();
const $fs = require("fs");
const path = require("path");
const request = require("request");
const unzip = require("unzip-stream");
// const addon = process.env.NODE_ENV === 'development' ? global.elRequire('static/addon.node') : global.elRequire('./static/addon.node');
import ScreenItem from "../components/ScreenItem";
import LoopPlay from "../components/LoopPlay";
import Login from "../components/login";
import { screensHotUpload } from "@/mixins/screen";
import { timeDisposeTool } from "@/mixins/index";
import { scoketId } from "../utils/scoketId";
import {
    getHomedir,
    miniviewDir,
    addon,
    contentTypeId,
    wsUrl,
} from "../utils/index";
import { mapState } from "vuex";

const screenJsonPath = miniviewDir() + "/screenJson.json";
const serialNumberPath = miniviewDir() + "/serialNumber.txt";
const resDir =
    process.env.NODE_ENV === "development"
        ? path.resolve("./") + "/static/res/"
        : path.resolve("./") + "/dist/static/res/";

export default {
    mixins: [screensHotUpload, timeDisposeTool],
    data() {
        return {
            loginError: "", //登录错误信息
            timer: undefined, //断线重连 定时器
            resData: {}, //屏幕时间轴数据
            copyResData: {},
            reFresh: false, //收到时间轴消息 7002 刷新屏幕子组件
            loginSuccess: false, //序列号登录成功
            ratioW: 1, //屏幕尺寸 适配时间轴容器 宽高比例
            ratioH: 1,
            serverTimeDiff: "0", //本地时间和服务器时间相差多少秒
            finalTime: "", //时间轴容器轮播时  最后一个内容的时间
            finalTimeDuration: "",
            isContent: false,
            socketConnectSuccess: false, //socket 是否连接成功
            pongTime: undefined, //心跳收到回复 时间
            heartBeatTimeOut: undefined, //心跳  定时器

            intervalPubList: [], //定时发布的 时间轴json
            jsonTimer: undefined, //定时发布 定时器
            timeStepTimer: undefined, //按时间步骤调度
        };
    },
    computed: {
        ...mapState({
            currentStepRegionId: (state) => state.currentStepRegionIds,
            stepIndex: (state) => state.stepIndex,
            stepData: (state) => state.stepData,
        }),
    },
    created() {
        win.show();
        win.setAlwaysOnTop(false);
        this.init();
        this.initWebsocket();
        let _this = this;
        nw.Screen.Init();
        nw.Screen.on("displayBoundsChanged", (event) => {
            _this.$nextTick(() => {
                _this.screenAdaptive();
            });
        });
    },
    methods: {
        init() {
            //创建文件夹目录
            var dirPath = path.join(getHomedir(), "miniview");
            if (!$fs.existsSync(dirPath)) {
                $fs.mkdirSync(dirPath);
                console.log("文件夹创建成功");
            } else {
                console.log("文件夹已存在");
            }
        },

        //初始化websocket
        initWebsocket() {
            if (this.socketConnectSuccess) return;
            clearTimeout(this.timer);
            this.websock = new WebSocket(wsUrl);
            this.websock.onopen = this.websocketopen;
            this.websock.onmessage = this.websocketonmessage;
            this.websock.onclose = this.websocketclose;
            this.websock.onerror = this.websocketerror;
        },

        //websocket连接成功
        websocketopen(data) {
            console.log("websocket连接成功");
            this.socketConnectSuccess = true;
            clearTimeout(this.heartBeatTimeOut);
            if (this.timer) clearTimeout(this.timer);
            this.heartBeat();
            this.readFileSerialNumber();
        },

        //socket 发送消息
        websocketSendData(data) {
            try {
                if (this.socketConnectSuccess) {
                    this.websock.send(JSON.stringify(data));
                }
            } catch (error) {}
        },

        //socket 收到消息
        websocketonmessage(event) {
            let msg = JSON.parse(event.data);
            if (!msg) return;

            if (msg.code === 304) {
                //序列号 登录失败
                this.writeFile(serialNumberPath, "");
                this.loginError = msg.message;
                this.$refs.login.loginLoading = false;
            } else if (msg.code === 0) {
                //序列号 登录成功
                this.enterFullscreen().then((res) => {
                    this.readFile();
                    this.loginSuccess = true;

                    //屏幕截图
                    this.updatedScreensHot();
                    this.$store.dispatch("setScreenId", msg.obj.screenId);
                    this.compareTime(msg.obj.timeStamp);
                });
            }

            switch (msg.id) {
                case 7000: //心跳回应
                    this.pongTime = new Date().getTime();
                    break;
                case 7001: //设置音量
                    this.setVolume(msg.value);
                    break;
                case 7002: //设置时间轴数据
                    this.timelineData(msg);
                    break;
                case 7003: //设置静音
                    this.setMute();
                    break;
                case 7004: //请求更新截图
                    this.ykScreensHot();
                    break;
                case 7005: //请求硬件绑定
                    this.bindMacAddress();
                    break;
                default:
                    break;
            }
        },

        //websocket关闭
        websocketclose() {
            console.log("WebSocket关闭");
            this.socketConnectSuccess = false;
            clearTimeout(this.heartBeatTimeOut);
            this.reconnection();
        },

        //websocket连接失败
        websocketerror() {
            console.log("WebSocket连接失败");
            this.socketConnectSuccess = false;
            clearTimeout(this.heartBeatTimeOut);
            this.reconnection();

            if (!this.isContent && $fs.readFileSync(serialNumberPath, "utf8")) {
                this.isContent = true;
                this.enterFullscreen();
                this.readFile();
                this.loginSuccess = true;
            }
        },

        closeSocket() {
            clearTimeout(this.heartBeatTimeOut);
            this.websock.close();
        },

        //websocket断线重连  10秒重连一次
        reconnection() {
            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.initWebsocket();
            }, 10000);
        },

        //websocket心跳  20秒一次
        heartBeat() {
            if (this.heartBeatTimeOut) clearTimeout(this.heartBeatTimeOut);
            this.heartBeatTimeOut = setTimeout(() => {
                this.websocketSendData({ id: scoketId.ping });
                this.heartBeat();
            }, 20000);
        },

        //全屏显示
        enterFullscreen() {
            return new Promise((resolve) => {
                win.enterFullscreen();
                resolve(true);
            });
        },

        //同步时间轴数据
        synTimelineContent() {
            this.websocketSendData({
                id: scoketId.synContent,
            });
        },

        //设置时间轴 消息
        timelineData(msg) {
            // 定时发布消息 playTime
            if (msg.playTime) {
                msg.playTime = new Date(msg.playTime).getTime() / 1000;
                this.saveIntervalPub(msg);
                return;
            }

            this.writeFile(screenJsonPath, JSON.stringify(msg));
            this.reFresh = false;
            this.resData = [];
            this.$nextTick(() => {
                this.resData = msg;
                this.copyResData = JSON.parse(JSON.stringify(this.resData));
                this.setTimelineRule();
                this.screenAdaptive();
                this.findFinalTime();
                this.reFresh = true;
                var dirPath = resDir;

                this.timeInterval();

                //清空本地资源文件
                if ($fs.existsSync(dirPath)) {
                    rmdir(dirPath, () => {
                        console.log("文件删除完毕");
                        this.clearContent();
                        this.downloadFile(this.resData);
                    });
                } else {
                    this.downloadFile(this.resData);
                }
            });
        },

        //发布时间轴时 清除当前播放的资源
        clearContent() {
            this.$refs.playItem.forEach((item, index) => {
                try {
                    this.$refs.playItem[index].clearCurrentPath();
                } catch (error) {}
            });
        },

        // 写入文件
        writeFile(path, data) {
            $fs.writeFileSync(path, data, "utf8", function (err) {
                //如果err=null，表示文件使用成功，否则，表示希尔文件失败
                if (err) {
                    console.log("写文件出错了，错误是：" + err);
                } else {
                    console.log("ok");
                }
            });
        },

        //下载资源到本地
        downloadFile(data) {
            //创建文件夹目录
            var dirPath = resDir;
            if (!$fs.existsSync(dirPath)) {
                $fs.mkdirSync(dirPath);
                console.log("文件夹创建成功");
            } else {
                console.log("文件夹已存在");
            }
            for (let i = 0; i < data.regions.length; i++) {
                let timeline = data.regions[i].timeline;
                for (let t = 0; t < timeline.length; t++) {
                    // 图集
                    if (timeline[t].contentTypeId == contentTypeId.atlas) {
                        for (
                            let atlas = 0;
                            atlas < timeline[t].subContentsData.length;
                            atlas++
                        ) {
                            let data = timeline[t].subContentsData[atlas];
                            this.downloadFileResult(i, data);
                        }
                    } else {
                        this.downloadFileResult(i, timeline[t]);
                    }
                }
            }
        },

        //下载
        downloadFileResult(i, data) {
            let contentPath = "";
            let fileName = "";
            let that = this;
            //游戏
            if (data.contentTypeId === contentTypeId.game) {
                contentPath = data.application.screenPackage;
                if (!contentPath) return;
                fileName = contentPath
                    .substring(
                        contentPath.lastIndexOf(
                            "/",
                            contentPath.lastIndexOf("/") - 1
                        ) + 1
                    )
                    .replace("/", "-");
            } else {
                contentPath = data.contentPath;
                fileName = contentPath.substring(
                    contentPath.lastIndexOf("/") + 1
                );
            }

            if (!$fs.existsSync(resDir + fileName)) {
                let stream = $fs.createWriteStream(
                    path.join(resDir, "downloading" + fileName)
                );
                request(contentPath)
                    .pipe(stream)
                    .on("close", function (err) {
                        console.log("文件[" + fileName + "]下载完毕");
                        try {
                            if (
                                $fs.existsSync(resDir, "downloading" + fileName)
                            ) {
                                $fs.rename(
                                    path.join(resDir, "downloading" + fileName),
                                    path.join(resDir, fileName),
                                    (err) => {
                                        if (!err) {
                                            if (fileName.indexOf(".zip") > -1) {
                                                that.fileUncompress(
                                                    resDir + fileName,
                                                    path.join(
                                                        resDir,
                                                        fileName.split(
                                                            ".zip"
                                                        )[0]
                                                    )
                                                );
                                            }
                                        }
                                    }
                                );
                            }
                        } catch (err) {
                            console.log(err);
                        }
                    });
            } else {
                console.log("已下载", fileName);
            }
        },

        //游戏zip 文件下载成功后 解压
        fileUncompress(fileDir, fileName) {
            try {
                $fs.createReadStream(fileDir)
                    .pipe(unzip.Extract({ path: fileName }))
                    .on("close", () => {
                        console.log("unzip success");
                    })
                    .on("error", (err) => {
                        console.log(err);
                    });

                setTimeout(() => {
                    this.$refs.playItem.forEach((item, index) => {
                        try {
                            this.$refs.playItem[index].getResourcesPath(
                                fileDir.split("res/")[1].split(".zip")[0]
                            );
                        } catch (error) {}
                    });
                }, 10000);
            } catch (err) {}
        },

        // 读取文件数据
        readFile() {
            try {
                let obj = $fs.readFileSync(screenJsonPath, "utf8");
                this.resData = JSON.parse(obj);
                this.copyResData = JSON.parse(JSON.stringify(this.resData));
                this.findFinalTime();
                this.reFresh = false;
                this.$nextTick(() => {
                    this.setTimelineRule();
                    this.reFresh = true;
                    this.downloadFile(this.resData);
                    this.timeInterval();
                    this.screenAdaptive();
                    this.synTimelineContent();
                });
            } catch (error) {
                this.synTimelineContent();
            }
        },

        // 读取文件数据  屏幕序列号
        readFileSerialNumber() {
            try {
                let num = $fs.readFileSync(serialNumberPath, "utf8");
                if (this.$refs.login && num)
                    this.$refs.login.setSerialNumber(num);
                if (num) this.serialLoginSuccess(num);
            } catch (error) {
                this.showLogin = true;
            }
        },

        //序列号登录
        login(num) {
            if (!this.socketConnectSuccess) {
                this.loginError = "网络连接已断开~";
                this.$refs.login.loginLoading = false;
                return;
            }
            this.writeFile(serialNumberPath, num);
            this.serialLoginSuccess(num);
        },

        serialLoginSuccess(num) {
            this.websocketSendData({
                id: scoketId.login,
                serialNumber: num,
                //获取屏幕 mac地址
                mac: addon().getMacAddress(),
                //获取音量
                volume: addon().getVolume(),
            });
        },

        //硬件绑定
        bindMacAddress() {
            this.websocketSendData({
                id: scoketId.macBind,
                mac: addon().getMacAddress(),
            });
        },

        //设置静音
        setMute() {
            addon().setVolume(0);
        },

        //设置音量
        setVolume(value) {
            addon().setVolume(value);
        },

        //根据屏幕尺寸 适配时间轴容器
        screenAdaptive(w, h) {
            let _width = w ? w : window.screen.width; //屏幕宽
            let _height = h ? h : window.screen.height; //屏幕高
            this.ratioW = (_width / this.resData.width).toFixed(3); //宽比例
            this.ratioH = (_height / this.resData.height).toFixed(3); //高比例

            //二次验证
            var sizeTimer = setTimeout(() => {
                let width = (_width / this.resData.width).toFixed(3);
                if (_width != window.screen.width) {
                    this.screenAdaptive(
                        document.body.clientWidth,
                        document.body.clientHeight
                    );
                } else {
                    clearTimeout(sizeTimer);
                }
            }, 3000);
        },

        //本地时间比较服务器返回的时间， 相差值 多少秒
        compareTime(time) {
            this.serverTimeDiff = (
                (new Date().getTime() - time) /
                1000
            ).toFixed(0);
        },

        //时间轴设置为整体轮播 找到最后一个内容的播放时间
        findFinalTime() {
            let arr = [];
            if (this.resData.isRotation) {
                this.resData.regions.forEach((item, index) => {
                    arr = [...arr, ...item.timeline];
                });
                let obj = arr.sort((a, b) => {
                    return (
                        this.timeDifference(b.beginTime) -
                        this.timeDifference(a.beginTime)
                    );
                });

                this.finalTime = obj[0].beginTime;
                this.finalTimeDuration = obj[0].duration;
            } else {
                this.finalTime = "";
                this.finalTimeDuration = "";
            }
        },

        //保存定时发布数据
        saveIntervalPub(data) {
            this.intervalPubList = localStorage.timelineArr
                ? JSON.parse(localStorage.timelineArr)
                : [];
            if (this.intervalPubList.indexOf(data.playTime) == -1) {
                this.intervalPubList.push(data.playTime);
                this.intervalPubList.sort((a, b) => {
                    return a - b;
                });
                localStorage.timelineArr = JSON.stringify(this.intervalPubList);
            }

            this.writeFile(
                `${miniviewDir()}/${data.playTime}.json`,
                JSON.stringify(data)
            );

            this.timeInterval();
        },

        //定时发布
        timeInterval() {
            this.intervalPubList = localStorage.timelineArr
                ? JSON.parse(localStorage.timelineArr)
                : [];
            if (!this.intervalPubList.length) {
                return;
            }

            clearTimeout(this.jsonTimer);
            let intervalPubList = this.intervalPubList.sort((p, n) => {
                return p - n;
            });
            let pubTime = intervalPubList[0];

            let currentTime = new Date().getTime() / 1000 - this.serverTimeDiff;

            let diff = pubTime - currentTime ? pubTime - currentTime : 0;

            let path = `${miniviewDir()}/${pubTime}.json`;

            this.jsonTimer = setTimeout(() => {
                let file = $fs.readFileSync(path, "utf8");
                let json = JSON.parse(file);
                delete json.playTime;
                this.timelineData(json);

                //删除定时发布的json
                $fs.unlinkSync(path);
                this.intervalPubList.splice(0, 1);
                localStorage.timelineArr = JSON.stringify(this.intervalPubList);
            }, diff * 1000);
        },

        //关闭游戏资源
        hideVideo(status) {
            this.$refs.playItem.forEach((item, index) => {
                try {
                    this.$refs.playItem[index].closeVideo(status);
                } catch (error) {}
            });
        },

        //设置时间轴调度 配置
        setTimelineRule() {
            if (!this.resData.scheduleRule || !this.resData.timelineScheduleSteps.length) return;
            let {
                scheduleRule,
                scheduleLoop,
                timelineScheduleSteps,
            } = this.resData;
            this.$store.commit("SET_RULE_TYPE", scheduleRule);
            this.$store.commit("SET_ROTATION_STEP", scheduleLoop);
            this.$store.commit("SET_STEP_DATA", timelineScheduleSteps);
            this.$store.commit("SET_STEP_INDEX", 0);
            if (this.resData.scheduleRule) {
                this.accordingStepPlay();
            }
        },

        //按照步骤播放
        accordingStepPlay() {
            let steps = this.$store.state.stepData;
            let rule = this.$store.state.ruleType;
            if (steps && steps.length) {
                if (rule == 1) {
                    this.timelineContentPlay();
                } else if(rule == 2) {
                    this.timelineTimePlay();
                }
            }
        },

        //按照 步骤里屏幕区域 资源开始时间最早 时间播放
        timelineTimePlay() {
            clearTimeout(this.timeStepTimer);
            if (this.stepIndex + 1 > this.stepData.length - 1) return;
            let nextStepRegionIds = this.stepData[this.stepIndex + 1].regionIds;
            let obj = this.findCurrentStepScreen(nextStepRegionIds).sort(
                (a, b) => {
                    return (
                        this.timeDifference(a.beginTime) -
                        this.timeDifference(b.beginTime)
                    );
                }
            );

            let pTime = this.timeDifference(
                this.getNowTime(),
                obj[0].beginTime,
                true
            );

            if (pTime < 0) pTime = 0;
            this.timeStepTimer = setTimeout(() => {
                this.$store.dispatch("setStepIndex");
            }, pTime * 1000);
        },

        //按照内容播放 按照步骤里 最后一个内容播放完之后  播放下一个步骤
        timelineContentPlay() {
            // this.$store.commit('SET_STEP_INDEX')
            //屏幕区域 最后一个内容时间
            let obj = this.findCurrentStepScreen(this.currentStepRegionId).sort(
                (a, b) => {
                    return (
                        this.timeDifference(
                            this.updateStartTime(b.beginTime, b.duration)
                        ) -
                        this.timeDifference(
                            this.updateStartTime(a.beginTime, a.duration)
                        )
                    );
                }
            );

            this.$store.commit(
                "SET_STEP_FINAL_TIME",
                obj[0].beginTime + obj[0].regionId
            );
        },

        //当前步骤里 的屏幕区域
        findCurrentStepScreen(currentStepRegionId) {
            let data = this.resData.regions.filter((item) => {
                return currentStepRegionId.includes(item.regionId);
            });

            let arr = [];
            data.forEach((item, index) => {
                item.timeline.forEach((t) => {
                    t.regionId = item.regionId;
                });
                arr = [...arr, ...item.timeline];
            });
            return arr;
        },
    },
    beforeDestroy() {
        this.closeSocket();
    },
    components: {
        ScreenItem,
        LoopPlay,
        Login,
    },

    watch: {
        stepIndex(val) {
            console.log("当前步骤---->", val);
            this.resData = [];
            let data = JSON.parse(JSON.stringify(this.copyResData));
            this.$nextTick(() => {
                this.resData = data;
                this.accordingStepPlay();
            });
        },
    },
};

//删除文件夹 及 文件
function rmdir(dir, callback) {
    $fs.readdir(dir, (err, files) => {
        /**
         * @desc 内部循环遍历使用的工具函数
         * @param {Number} index 表示读取files的下标
         */
        function next(index) {
            // 如果index 等于当前files的时候说明循环遍历已经完毕，可以删除dir，并且调用callback
            if (index == files.length) return $fs.rmdir(dir, callback);
            // 如果文件还没有遍历结束的话，继续拼接新路径，使用fs.stat读取该路径
            let newPath = path.join(dir, files[index]);
            // 读取文件，判断是文件还是文件目录

            $fs.stat(newPath, (err, stat) => {
                if (stat.isDirectory()) {
                    // 因为我们这里是深度循环，也就是说遍历玩files[index]的目录以后，才会去遍历files[index+1]
                    // 所以在这里直接继续调用rmdir，然后把循环下一个文件的调用放在当前调用的callback中
                    rmdir(newPath, () => next(index + 1));
                } else {
                    // 如果是文件，则直接删除该文件，然后在回调函数中调用遍历nextf方法，并且index+1传进去
                    $fs.unlink(newPath, () => next(index + 1));
                }
            });
        }
        next(0);
    });
}
</script>
<style scope>
@import "../styles/index.css";
</style>
