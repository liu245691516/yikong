import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const state = {
    screenId: undefined,           //屏幕id
    
    stageIndex: -1,                //当前阶段
    scheduleLoop: 0,               //是否循环步骤
    stepData: [],                  //步骤数据
    stepIndex: 0,                  //当前步骤 index
    currentStepRegionIds: [],      //当前区域id数据
    stepFinalInfo: '',             //步骤里最后一个 结束内容 的开始时间
}

const mutations = {
    //屏幕id
    SET_SCREEN_ID(state, infos) {
        state.screenId = infos
    },

    //当前阶段
    SET_STAGE_INDEX(state, data){
        state.stageIndex = state.stageIndex += 1;
    },


    //设置是否循环步骤
    SET_LOOP_STEP(state, status){
        state.scheduleLoop = status;
    },

    //调度步骤数据
    SET_STEP_DATA(state, data){
        state.stepData = data;
    },

    //当前步骤
    SET_STEP_INDEX(state, index){
        state.stepIndex = index;
        if(state.stepData.length) state.currentStepRegionIds = state.stepData[index].regionIds;
    },

    //步骤内最后一个播放内容的 尺寸位置信息
    SET_STEP_FINAL_INFO(state, data){
        state.stepFinalInfo = data;
    }

}

const actions = {
    setScreenId({commit}, data) {
        commit('SET_SCREEN_ID', data);
    },

    setStepIndex({commit, state}, data) {
        if(data && data != state.stepFinalInfo) return;
        let index = state.stepIndex;
        index += 1;
        if(state.ruleType == 1 && index > state.stepData.length-1 && state.scheduleLoop){
            index = 0;
        }else if(index >= state.stepData.length-1){
            index = state.stepData.length-1;
        }
        commit('SET_STEP_INDEX', index);
    }
}


export default new Vuex.Store({
    state,
    mutations,
    actions
})