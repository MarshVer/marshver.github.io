---
title: 远程连接Ubuntu
date: 2024-01-12 11:13:09
tags: 教程
description: Ubuntu建立远程连接
---

# 虚拟机
网络需要开始NAT模式

# Ubuntu系统
## 安装ssh服务
```
sudo apt-get install ssh
```
## 启动ssh
```
// 切换成root用户
sudo -i

// 启动ssh服务
service ssh start

// 检查ssh服务是否启动成功
ps -e | grep ssh

// 启用ssh命令
systemctl enable
```