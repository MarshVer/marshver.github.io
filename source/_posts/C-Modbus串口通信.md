---
title: C#Modbus串口通信
date: 2023-06-10 11:04:19
tags: 项目
description: C#Modbus串口通信，即按照Modbus协议请求从站读或写，然后从站将发回响应报文，从中截取需要的数据即可。
---

# 03请求读
```
ushort startAddr = 0;
ushort readLen = 2;

List<byte> command = new List<byte>();
//从站地址
command.Add(0x01);
//功能码，读保持寄存器
command.Add(0x03);
//起始地址
command.Add(BitConverter.GetBytes(startAddr)[1]);
command.Add(BitConverter.GetBytes(startAddr)[0]);
//读取数量
command.Add(BitConverter.GetBytes(readLen)[1]);
command.Add(BitConverter.GetBytes(readLen)[0]);
//CRC校验
command = CRC16(command);

serialPort.Write(command.ToArray(), 0, command.Count);

//固定请求读
Task.Run(() =>
    {
        byte[] respBytes1 = {0x01, 0x03, 0x4e, 0x20, 0x00, 0x0A, 0xd3, 0x25};
        byte[] respBytes2 = {0x02, 0x03, 0x4e, 0x20, 0x00, 0x0A, 0xd3, 0x25};
        serialPort1.Write(respBytes1, 0, 8);
        Thread.Sleep(1000);
        serialPort1.Write(respBytes2, 0, 8);
        Thread.Sleep(1000);
    });
```



# 获取数据
```
byte[] respBytes = new byte[serialPort.BytesToRead];
serialPort.Read(respBytes, 0, respBytes.Length);
List<byte> respList = new List<byte>(respBytes);

respList.RemoveRange(0, 3);//截去：从站地址  功能码  字节计数
respList.RemoveRange(respList.Count - 2, 2);//截去：校验位

byte[] data = new byte[2];//获取需要的2个字节数据
data[0] = respList[N * 2 + 1];//N为第N+1个字节数据
data[1] = respList[N * 2];
string value = BitConverter.ToUInt16(data, 0).ToString();//将其转化为字符型
```

# 10请求写
```
private void correct(string text, ushort slave)
{
    ushort startAddr = 0;//写入地址
    ushort writeLen = 1;//写入数量
    ushort value = ushort.Parse(text);//写入值

    List<byte> command = new List<byte>();

    command.Add((byte)slave);//从站地址
    command.Add(0x10);//功能码，写多个寄存器
    //写入地址
    command.Add(BitConverter.GetBytes(startAddr)[1]);
    command.Add(BitConverter.GetBytes(startAddr)[0]);
    //写入数量
    command.Add(BitConverter.GetBytes(writeLen)[1]);
     command.Add(BitConverter.GetBytes(writeLen)[0]);
    //字节数
    byte[] valueBytes = BitConverter.GetBytes(value);
    command.Add((byte)valueBytes.Length);
    //写入值
    command.Add(BitConverter.GetBytes(value)[1]);
    command.Add(BitConverter.GetBytes(value)[0]);
    //CRC校验
    command = CRC16(command);

    serialPort.Write(command.ToArray(), 0, command.Count);

}
```


# CRC校验
```
 static List<byte> CRC16(List<byte> value, ushort poly = 0xA001, ushort crcInit = 0xFFFF)
 {
    if (value == null || !value.Any())
    throw new ArgumentException("");

    //运算
    ushort crc = crcInit;
    for (int i = 0; i < value.Count; i++)
    {
        crc = (ushort)(crc ^ (value[i]));
        for (int j = 0; j < 8; j++)
        {
            crc = (crc & 1) != 0 ? (ushort)((crc >> 1) ^ poly) : (ushort)(crc >> 1);
        }
    }
    byte hi = (byte)((crc & 0xFF00) >> 8);  //高位置
    byte lo = (byte)(crc & 0x00FF);         //低位置

    List<byte> buffer = new List<byte>();
    //添加校验原始值
    buffer.AddRange(value);
    //添加校验位值
    buffer.Add(lo);
    buffer.Add(hi);

    //加上原始校验值返回
    return buffer;
}
```