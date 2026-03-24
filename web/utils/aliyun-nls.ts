// 从URL获取参数 userToken
export const getUrlParam = (name: string): string => {
  if (typeof window === 'undefined') return ''
  const reg = new RegExp(`(^|&)${name}=([^&]*)(&|$)`, 'i')
  const res = window.location.search.substr(1).match(reg)
  if (res != null) return decodeURIComponent(res[2])
  return ''
}

// 获取阿里云Token（使用 XMLHttpRequest 彻底避开所有 fetch 封装）
export const fetchAliyunNlsToken = (): Promise<{ token: string; appKey: string }> => {
  return new Promise((resolve, reject) => {
    try {
      const userToken = getUrlParam('userToken')
      if (!userToken) {
        reject(new Error('未获取到用户凭证'))
        return
      }

      const xhr = new XMLHttpRequest()
      xhr.open('GET', 'https://www.wnxbdcdjzx.com/bdcpt/a/json/wechat/Rzdb/getNlsToken')
      xhr.setRequestHeader('Authorization', userToken)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.responseType = 'json'

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = xhr.response
          if (data.result_code === '200') {
            resolve({
              token: data.result,
              appKey: 'PtcXfBxLzBd8HU4N',
            })
          } else {
            reject(new Error(data.result_msg || '获取Token失败'))
          }
        } else {
          reject(new Error('请求失败'))
        }
      }

      xhr.onerror = () => reject(new Error('网络异常'))
      xhr.send()
    } catch (err) {
      reject(err)
    }
  })
}