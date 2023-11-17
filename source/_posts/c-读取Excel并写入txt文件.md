---
title: c#读取Excel并按规则替换Excel数据写入txt文件
date: 2023-11-07 17:44:04
tags: 项目
description: c#读取Excel并按规则替换Excel数据写入txt文件
---

# 安装NPOI
1. vs-工具-NuGet程序包管理器-管理解决方案的NuGet程序包
2. 搜索NPOI下载并安装

注：若编译器报错可选择较低版本

# 选择文件
```C#
        private string SelectFolder1(TextBox tb)
        {
            string ret = "";
            System.Windows.Forms.OpenFileDialog dialog = new System.Windows.Forms.OpenFileDialog();
            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                tb.Text = dialog.FileName;
            }
            return ret;
        }
```

# 选择文件夹
```C#
        private string SelectFolder2(TextBox tb)
        {
            string ret = "";
            System.Windows.Forms.FolderBrowserDialog dialog = new System.Windows.Forms.FolderBrowserDialog();
            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                tb.Text = dialog.SelectedPath;
            }
            return ret;
        }
```
# 转换代码
```C#
private void transform_Click(object sender, EventArgs e)
        {
            try
            {
                using (FileStream fs = new FileStream(excel_folder.Text, FileMode.Open, FileAccess.Read))
                {
                    XSSFWorkbook workBook = new XSSFWorkbook(fs);
                    ISheet sheet = workBook.GetSheetAt(0);//读取Excel的第一个sheet

                    FileStream fs1 = new FileStream(dhFiler.Text + "\\LSTREC.TXT", FileMode.Create, FileAccess.Write);
                    StreamWriter sw = new StreamWriter(fs1, Encoding.GetEncoding("UTF-8"));//新建写txt文件

                    sw.WriteLine("idLen;idStyle;idRec;abCat;time;name;date;place");
                    string idLen, idStyle, idRec, abCat, time, name, date, place, eventName;
                    Hashtable idStyleTable = new Hashtable();//泳姿hash表

                    FileStream fsStyle = new FileStream(dhFiler.Text + "\\LSTSTYLE.TXT", FileMode.Open, FileAccess.Read);
                    StreamReader sr1 = new StreamReader(fsStyle);//读取泳姿替换文件

                    string key;
                    while (sr1.Peek() >= 0)
                    {
                        key = sr1.ReadLine().ToString();
                        idStyleTable.Add(key.Split(";".ToCharArray())[1].Replace("\"", ""), key.Split(";".ToCharArray())[0].Replace("\"", ""));
                    }
                    Hashtable abCatTable = new Hashtable();//性别hash表

                    FileStream fsAbCat = new FileStream(dhFiler.Text + "\\LSTCAT.TXT", FileMode.Open, FileAccess.Read);
                    StreamReader sr2 = new StreamReader(fsAbCat);//读取性别替换文件

                    while (sr2.Peek() >= 0)
                    {
                        key = sr2.ReadLine().ToString();
                        abCatTable.Add(key.Split(";".ToCharArray())[0].Replace("\"", ""), key.Split(";".ToCharArray())[1].Replace("\"", ""));
                    }


                    for (int r = 1; r < sheet.LastRowNum; r++)
                    {
                        if (sheet.GetRow(r).GetCell(5).ToString() == "")
                        {
                            continue;
                        }
                        else
                        {
                            eventName = sheet.GetRow(r).GetCell(4).ToString().Replace(" ", "");//读取Excel r行4列数据，并除去空格

                            idStyle = idStyleTable[eventName.Substring(eventName.IndexOf("米") + 1)].ToString();//泳姿
                            idLen = selectIdLen(eventName.Remove(eventName.IndexOf("米"), eventName.Length - eventName.IndexOf("米")));//游泳距离（50，100，200，400，800，1500）
                            idRec = selectIdRec(sheet.GetRow(r).GetCell(2).ToString().Trim());//世界纪录，亚洲纪录。全国纪录
                            try
                            {
                                abCat = abCatTable[sheet.GetRow(r).GetCell(1).ToString().Trim()].ToString();//性别
                            }
                            catch
                            {
                                abCat = "";
                            }

                            time = sheet.GetRow(r).GetCell(5).ToString().Trim();//时间
                            name = sheet.GetRow(r).GetCell(6).ToString().Trim();//姓名
                            date = sheet.GetRow(r).GetCell(8).ToString().Trim();//日期

                            place = sheet.GetRow(r).GetCell(1).ToString().Trim() + eventName.Remove(eventName.IndexOf("米"), eventName.Length - eventName.IndexOf("米")) + "米" + eventName.Substring(eventName.IndexOf("米") + 1);//备注
                            switch (idRec)
                            {
                                case "0": place = place + "wr"; break;//备注
                                case "1": place = place + "ar"; break;//备注
                                case "2": place = place + "nr"; break;//备注
                                default: break;
                            }
                        }
                        sw.WriteLine(idLen + ";" + idStyle + ";" + idRec + ";" + abCat + ";" + time + ";" + name + ";" + date + ";" + place);//写1行txt数据
                    }
                    sw.Close();
                    fs1.Close();
                    MessageBox.Show("转换成功");
                }
            }
            catch
            {
                MessageBox.Show("请选择文件");
            }
            
        }

        //距离替换规则
        public string selectIdLen(string mile)
        {
            switch (mile)
            {
                case "50": mile = "0"; break;
                case "100": mile = "1"; break;
                case "200": mile = "2"; break;
                case "400": mile = "3"; break;
                case "800": mile = "4"; break;
                case "1500": mile = "5"; break;
                case "4X50": mile = "6"; break;
                case "4X100": mile = "7"; break;
                case "4X200": mile = "8"; break;
                default: break;
            }
            return mile;
        }

        //记录替换规则
        public string selectIdRec(string rec)
        {
            switch (rec)
            {
                case "世界纪录": rec = "0"; break;
                case "亚洲纪录": rec = "1"; break;
                case "全国纪录": rec = "2"; break;
                default: break;
            }
            return rec;
        }
```