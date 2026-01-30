export const postAnswerToParent = (answer: string) => {
  const windowAny = window as any;
  if (answer === '已启动智能审核') {
    // 启动智能审核
    windowAny.parent.postMessage({
      type: 'dify-chatbot-message',
      data: {
        method: 'audit',
        message: answer,
      },
    }, '*');
  }

  // if (windowAny.parent !== windowAny) {
  //   windowAny.parent.postMessage({
  //     type: 'dify-chatbot-answer',
  //     answer,
  //   }, '*');
  // }
}