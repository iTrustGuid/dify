/**
 * 阿里云语音识别 Token 获取工具
 * 已配置前端代理，解决CORS + 自动重试1次
 */
interface NlsTokenResponse {
  result_code: string
  result_msg: string
  result: string
}

const getUserTokenFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  return params.get('userToken')
}

const requestTokenWithCorsFix = async (userToken: string): Promise<{ token: string; appKey: string }> => {
  // 🔥 这里改成代理地址 /bdcpt-api（和 next.config.js 对应）
  // const url = '/bdcpt-api'
  const url = 'https://www.wnxbdcdjzx.com/bdcpt/a/json/wechat/Rzdb/getNlsToken'
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, true)
    xhr.setRequestHeader('Authorization', userToken)
    xhr.timeout = 10000

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as NlsTokenResponse
          if (data.result_code === '200' && data.result) {
            resolve({
              token: data.result,
              appKey: 'PtcXfBxLzBd8HU4N',
            })
          } else {
            reject(new Error(data.result_msg || '获取Token失败'))
          }
        } catch (e) {
          reject(new Error('解析数据失败'))
        }
      } else {
        reject(new Error(`请求失败：${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('网络异常'))
    xhr.ontimeout = () => reject(new Error('请求超时'))
    xhr.send()
  })
}

export async function fetchAliyunNlsToken(): Promise<{
  token: string
  appKey: string
}> {
  try {
    const userToken = getUserTokenFromUrl()
    if (!userToken) throw new Error('未获取到userToken')

    try {
      return await requestTokenWithCorsFix(userToken)
    } catch (firstErr) {
      console.warn('首次请求失败，重试一次')
      await new Promise(r => setTimeout(r, 300))
      return await requestTokenWithCorsFix(userToken)
    }

  } catch (error) {
    console.error('最终获取失败：', error)
    throw error
  }
}