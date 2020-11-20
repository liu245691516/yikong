let os = require('os');
let $fs = require('fs');

export const serverUrl = 'http://123.206.83.233:8181'; //'http://211.159.173.153:8181';    
export const wsUrl = 'ws://123.206.83.233:8181/screen_server';
// export const wsUrl = 'ws://172.19.112.254:8181/screen_server';


//当前用户的home目录
export function getHomedir() {
    return os.homedir();
}

//项目下载的文件路径
export function miniviewDir(){
    return os.homedir() + '/miniview';
}

//下载的资源内容路径
export function resDir(){
    return os.homedir() + '/miniview/res';
}

//c++插件
export function addon(){
    let node = undefined;
    if(os.type() === 'Windows_NT'){
        node = process.env.NODE_ENV === 'development' ? global.elRequire('static/addon/addon-win.node') : global.elRequire('./static/addon/addon-win.node');
    }else if(os.type() === 'Linux'){
        node = process.env.NODE_ENV === 'development' ? global.elRequire('static/addon/addon-linux.node') : global.elRequire('./static/addon/addon-linux.node');
    }
    return node
}

// 资源 类型
export const contentTypeId = {
    image: 1,
    video: 2,
    game: 3,
    atlas: 4
}

// 时间轴 调度类型
export const timelinePlayType = {
    content: 1,     //按照内容
    time: 2         //按照时间
}