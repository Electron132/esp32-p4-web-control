# ESP32-P4 Web 蓝牙控制台

这是给当前 ESP32-P4 LVGL 项目准备的浏览器控制网站。它通过 Web Bluetooth 连接板端 BLE GATT 服务，用 JSON 命令控制 RGB 彩灯、蜂鸣器、舵机，并读取 DHT11、HC-SR04、MPU6050 和红外接收状态。

## 启动

Web Bluetooth 需要安全上下文，推荐使用 `localhost`：

```powershell
cd C:\Users\21284\Desktop\lvgl_demo_release
.\start_web.ps1
```

然后用 Edge 或 Chrome 打开：

```text
http://localhost:5173
```

## 页面功能

- 连接面板：显示 BLE 连接、协议版本、回包年龄、运行时间和延迟。
- RGB 彩灯：白光、暖光、红、绿、蓝、黄、青、品红和关闭。
- 蜂鸣器：短鸣、长鸣、关闭。长鸣会保持到手动关闭。
- 舵机：滑块和快捷角度按钮控制 0-180 度。
- 传感器：显示 HC-SR04 距离、红外接收活动、MPU6050 加速度/角速度。
- 遥测：显示 DHT11 温湿度和状态，并支持 CSV 导出。
- 动作编排：录制、回放、导出、导入 RGB/蜂鸣器/舵机动作。
- 演示模式：没有连接板子时也能模拟数据和控件反馈。

## 支持的命令

协议命令输入框可以直接发送 JSON：

```json
{"cmd":"read"}
{"cmd":"rgb","color":"white"}
{"cmd":"rgb","color":"off"}
{"cmd":"rgb","r":255,"g":120,"b":28}
{"cmd":"buzzer","value":"beep","durationMs":120}
{"cmd":"buzzer","value":true}
{"cmd":"buzzer","value":false}
{"cmd":"servo","angle":90}
```

网页端仍兼容旧 `led` 命令，但当前界面不再显示独立 LED 组件，所有灯光操作都按 RGB 彩灯处理。

## 状态字段

完整状态由板端 `Status Read` 返回，常用字段如下：

```json
{
  "rgb": {"r": 255, "g": 255, "b": 255},
  "buzzer": false,
  "servo": 90,
  "temperature": 25.1,
  "humidity": 60.0,
  "dhtStatus": "ok",
  "distanceCm": 34.2,
  "hcsr04Valid": true,
  "mpu6050": {"valid": true, "ax": 0.01, "ay": 0.02, "az": 1.00, "gx": 0.0, "gy": 0.0, "gz": 0.0},
  "ir": {"active": false, "level": 1, "edges": 0}
}
```

## 检查

前端语法检查：

```powershell
& 'C:\Program Files\nodejs\node.exe' --check 'C:\Users\21284\Desktop\lvgl_demo_release\web-control\app.js'
```

完整网页烟测：

```powershell
cd C:\Users\21284\Desktop\lvgl_demo_release
.\test_web_control.ps1
```

## 实机注意

- Edge/Chrome 必须支持 Web Bluetooth，Windows 系统蓝牙也要开启。
- 首次连接会弹出设备选择窗口，选择广播名 `ESP32-P4 Control` 的设备。
- DHT11 无响应优先查 DATA=GPIO48、上拉电阻、3V3 和共地。
- HC-SR04 Echo 必须分压到 3.3V。
- 舵机和部分蜂鸣器模块若电流较大，建议独立供电并与开发板共地。
