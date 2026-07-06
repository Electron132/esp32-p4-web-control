# ESP32-P4 蓝牙控制台

这是 ESP32-P4 LVGL 项目的 Web Bluetooth 控制台。网页通过 BLE GATT 连接板端服务，向板子发送 JSON 命令，用来控制 RGB 彩灯、蜂鸣器、舵机，并读取 DHT11、HC-SR04、MPU6050、红外接收等状态。

当前网页是外设控制台，不包含云端大模型聊天输入框。云端大模型对话在设备触摸屏本地界面中使用。

## 在线地址

- GitHub Pages: https://electron132.github.io/esp32-p4-web-control/
- GitHub 仓库: https://github.com/Electron132/esp32-p4-web-control

推荐用 Chrome 或 Edge 打开在线地址，然后点击“连接板子”，选择广播名为 `ESP32-P4 Control` 的设备。

## 使用条件

- 浏览器必须支持 Web Bluetooth，推荐 Chrome 或 Edge。
- 页面必须从安全来源打开：
  - 可以：`https://electron132.github.io/esp32-p4-web-control/`
  - 可以：`http://localhost:5173`
  - 通常不可以：`http://局域网IP:5173`
- Windows、macOS、Linux 电脑可用。
- 安卓 Chrome 通常可用。
- iPhone / iPad 通常不支持 Web Bluetooth。
- 控制走 BLE 蓝牙，不依赖板子 Wi-Fi。

## 本地启动

如果要在电脑本地调试网页：

```powershell
cd "D:\technology1\ESP32Project\competioion_qianruuidasai\lvgl_demo_release(1)\lvgl_demo_release"
powershell -NoProfile -ExecutionPolicy Bypass -File .\start_web.ps1
```

然后用 Chrome 或 Edge 打开：

```text
http://localhost:5173
```

## 页面功能

- **连接面板**：显示 BLE 连接、协议版本、同步状态、回包延迟和运行时间。
- **RGB 彩灯**：支持白光、暖光、红、绿、蓝、黄、青、品红和关闭。
- **蜂鸣器**：支持短鸣、长鸣和关闭。
- **舵机**：支持滑块和快捷角度按钮，范围 `0-180°`。
- **传感器**：显示 DHT11 温湿度、HC-SR04 距离、MPU6050 加速度/角速度、红外接收状态。
- **动作编排**：支持录制、回放、导出、导入 RGB/蜂鸣器/舵机动作。
- **协议命令**：支持直接发送 JSON 命令。
- **演示模式**：不连接真实板子时也能模拟数据和控制反馈。
- **诊断导出**：可导出连接状态、最近日志和遥测数据，方便排查问题。

## 支持命令

协议命令输入框可以直接发送 JSON：

```json
{"cmd":"read"}
```

```json
{"cmd":"rgb","color":"white"}
```

```json
{"cmd":"rgb","color":"off"}
```

```json
{"cmd":"rgb","r":255,"g":120,"b":28}
```

```json
{"cmd":"buzzer","value":"beep","durationMs":120}
```

```json
{"cmd":"buzzer","value":true}
```

```json
{"cmd":"buzzer","value":false}
```

```json
{"cmd":"servo","angle":90}
```

网页端仍兼容旧的 `led` 命令，但当前界面主要按 RGB 彩灯处理。

## 状态字段

板端完整状态示例：

```json
{
  "ok": true,
  "message": "ok",
  "protocol": 1,
  "device": "ESP32-P4 Control",
  "bleTransport": "esp-hosted-vhci",
  "bleController": "esp32-c6",
  "bleReady": true,
  "bleConnected": true,
  "rgb": {"r": 255, "g": 255, "b": 255},
  "buzzer": false,
  "servo": 90,
  "temperature": 25.1,
  "humidity": 60.0,
  "dhtStatus": "ok",
  "distanceCm": 34.2,
  "hcsr04Valid": true,
  "mpu6050": {
    "valid": true,
    "ax": 0.01,
    "ay": 0.02,
    "az": 1.0,
    "gx": 0.0,
    "gy": 0.0,
    "gz": 0.0
  },
  "ir": {"active": false, "level": 1, "edges": 0}
}
```

## 部署方式

当前仓库通过 GitHub Pages 免费部署：

- 发布仓库：`https://github.com/Electron132/esp32-p4-web-control`
- 发布分支：`main`
- 发布目录：`/`
- 站点地址：`https://electron132.github.io/esp32-p4-web-control/`

更新网页后提交并推送：

```powershell
cd "D:\technology1\ESP32Project\competioion_qianruuidasai\lvgl_demo_release(1)\lvgl_demo_release\web-control"
git add .
git commit -m "Update web console"
git push origin main
```

GitHub Pages 通常会在几十秒到几分钟内刷新。若页面看起来没有变化，可以按 `Ctrl + F5` 强制刷新，或在网址后加查询参数，例如 `?v=latest`。

## 实机注意事项

- 首次连接会弹出蓝牙设备选择窗口，选择 `ESP32-P4 Control`。
- 如果搜不到设备，确认电脑或手机蓝牙已打开，板子已启动，再尝试“兼容扫描”。
- 网页不需要板子连接 Wi-Fi；浏览器设备通过 BLE 直接连板子。
- DHT11 无响应时优先检查 DATA 引脚、上拉电阻、3V3 和共地。
- HC-SR04 Echo 必须分压到 3.3V。
- 舵机和部分蜂鸣器模块电流较大，建议独立供电并与开发板共地。
- 不要把 Wi-Fi 密码、AI Key 或其他密钥写进网页文件；部署到 GitHub Pages 后 HTML、CSS、JS 都是公开可见的。
