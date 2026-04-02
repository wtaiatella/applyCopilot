import { MessageInstance } from 'antd/es/message/interface'
import { ModalStaticFunctions } from 'antd/es/modal/confirm'
import { NotificationInstance } from 'antd/es/notification/interface'

class AntdStaticBridge {
  private message: any = null
  private modal: any = null
  private notification: any = null

  setHandlers(
    message: any,
    modal: any,
    notification: any
  ) {
    this.message = message
    this.modal = modal
    this.notification = notification
  }

  get msg() {
    return this.message
  }

  get mod() {
    return this.modal
  }

  get notify() {
    return this.notification
  }
}

export const antdStatic = new AntdStaticBridge()
