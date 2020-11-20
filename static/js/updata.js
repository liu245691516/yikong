let gui = require('nw.gui'); //操作nw应用
let pkg = require('package.json'); // 本地配置文件
let os = require('os');
let updater = undefined;
if(os.type() === 'Windows_NT'){
    updater = require('./static/node_modules/node-webkit-updater');
}else {
    updater = require('node-webkit-updater'); //热更新
}
let path = require('path');
const $fs = require('fs');
let upd = new updater(pkg);
let copyPath, execPath;
let progressTimer; //设置一个定时器，用来模拟下载的进去条
let win = nw.Window.get();
let inner = document.getElementById("xfj-progress");


if (gui.App.argv.length) {
    copyPath = gui.App.argv[0];
    execPath = gui.App.argv[1];
    move();
    document.getElementById("xfj-update").getElementsByTagName('h3')[0].innerHTML = '正在安装...';
    document.getElementById("app").style.display = 'none';

    // 替换旧版本
    upd.install(copyPath, function(err) {
        console.log(copyPath, err)
        if (!err) {
            inner.innerHTML = '100%';
            inner.style.width = '100%';
            console.log('重启')
            // 重启
            upd.run(execPath, null);
            gui.App.quit();
        }
    });
} else {
    // 从manifest目录校验版本
    upd.checkNewVersion(function(error, newVersionExists, manifest) {
        console.log(newVersionExists, manifest)
        if (!error && newVersionExists) {
            // 有新版本显示下载进度条开始下载
            win.leaveFullscreen();
            move();
            upd.download(function(error, filename) {
                console.log(error)
                if (!error) {
                    // 下载完成关闭应用
                    upd.unpack(filename, function(error, newAppPath) {
                        console.log(error)
                        if (!error) {
                            var newAppDir = path.dirname(newAppPath); 
                            clearInterval(progressTimer);
                            inner.innerHTML = '100%';
                            inner.style.width = '100%';
                            
                            //替换解码器
                            //win
                            if ($fs.existsSync(newAppDir + '/dist/static/ffmpeg.dll') && $fs.existsSync(newAppDir + '/ffmpeg.dll')) {
                                $fs.rename(newAppDir + '/dist/static/ffmpeg.dll', newAppDir +'/ffmpeg.dll',function(err){
                                    if(err){
                                        throw err;
                                    }
                                })
                            } 

                            //linux
                            if ($fs.existsSync(newAppDir + '/dist/static/libffmpeg.so') && $fs.existsSync(newAppDir + '/lib/libffmpeg.so')) {
                                $fs.rename(newAppDir + '/dist/static/libffmpeg.so', newAppDir +'/lib/libffmpeg.so',function(err){
                                    console.log(err)
                                    if(err){
                                        throw err;
                                    }
                                })
                            } 

                            // 重启应用
                            setTimeout(() => {
                                upd.runInstaller(newAppPath, [upd.getAppPath(), upd.getAppExec()], {cwd: newAppDir});
                                gui.App.quit();
                            }, 700);
                        }
                    }, manifest);
                }
            }, manifest);

        }
    });
}

function move(){
    document.getElementById("xfj-update").style.display = 'block';
    document.getElementById("app").innerHTML = '';
    var width = 1;
    progressTimer = setInterval(addwidth, 300);
    function addwidth(){
        if(width >= 100){
            clearInterval(progressTimer);
        }else{
            width += Math.random() * 2;
            if (width >= 95) {
                clearInterval(progressTimer);
                width = 95;
            }
            inner.innerHTML = width.toFixed(2) + '%';
            inner.style.width = width + '%';
        }
    }
}
