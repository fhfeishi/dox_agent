![](images/page_0_image_0.jpg)

项目批准号 62202197申请代码 F0206归口管理部门收件日期

![](images/page_0_image_2.jpg)

20251162202197

# 国家自然科学基金

# 资助项目结题/成果报告

资助类别:青年科学基金项目（C类）[原青年科学基金项目]

亚类说明:

附注说明:

项目名称:面向图神经网络隐私保护的安全多方计算技术研究

负责人:王婧

BRID: 01798.00.56967

电子邮件:cswjing@hust.edu.cn

电话: 15107137650

依托单位: 华中科技大学

联系人:游超

电话: 027-87543437

资助经费:30.0000（万元）

执行年限: 2023.01-2025.12

填表日期:2025年12月22日

国家自然科学基金委员会制（2025年）

## 项目摘要

## 中文摘要:

图神经网络具有强大的图学习与推理能力，但其预测与训练需以大量数据为支撑，而大规模数据的跨域收集和使用极易造成个人隐私信息的泄露。安全多方计算是实现分布式隐私计算的核心技术之一，但现有安全多方计算方案存在通信开销较高、难以抵抗恶意敌手等问题。本项目注重数据隐私、计算效能等实际需求，拟利用函数秘密分享、同态承诺、信息论消息认证码、可验证秘密分享等密码原语，研究面向图神经网络隐私保护的安全多方计算技术，主要包括:1)研究通信友好的图神经网络隐私计算组件，突破高阶算子多方计算协议的效能瓶颈；2)研究抗强攻击者的图神经网络隐私保护方案，实现不同计算模式下的抗恶意敌手安全性；3)研究图神经网络多方计算方案的可证明安全与高效实现，验证并优化方案的安全与效率。本项目的研究成果将有助于推动安全多方计算的创新应用，提高图神经网络数据安全与隐私保护水平，促进人工智能产业的健康发展。

## Abstract:

Graph neural network (GNN) is powerful in graph learning and inference, but its prediction and training require a large amount of data. However, the collection and utilization of large-scale data across domains are apt to disclose personal privacy information. Secure multi-party computation (MPC) is one of the critical technologies to realize the distributed privacy-preserving computation. Nevertheless, the existing MPC schemes suffer from some weaknesses, such as high communication costs and difficulty in resisting malicious adversaries. This project focuses on the practical requirements in data privacy and computing efficiency. It plans to study the MPC technologies for privacy-preserving GNN based on some cryptographic primitives, such as the function secret sharing, homomorphic commitments, information-theoretic message authentication code and verifiable secret sharing. The main researches include: 1) studying the communication-friendly privacy-preserving computation methodology for GNN components and breaking through the performance bottleneck of MPC protocols in high-order operators; 2) studying the construction of privacy-preserving GNN schemes against malicious adversaries under different computing modes; 3) studying the provable security and efficient implementation of the proposed schemes for verifying and optimizing the security and performance. The research results of this project will promote the innovative application of MPC technologies, improve the level of data security and privacy protection for GNN, and finally promote the healthy development of artificial intelligence industries.

关键词（用分号分开）:安全多方计算；隐私保护；秘密共享；可证明安全；图神经网络

Keywords (separated by;): Secure Multi-party Computation; Privacy Preservation; Secret Sharing; Provable Security; Graph Neural Networks

## 结题摘要

## 中文摘要（对项目的背景、主要研究内容、重要结果、关键数据及其科学意义等做简单概述）:

本项目围绕图神经网络在跨域多源数据协同建模中面临的隐私泄露风险与计算效率瓶颈问题，基于安全多方计算理论与方法，系统完成了面向图神经网络的分布式隐私保护计算关键技术研究，并全面达成预期研究目标。首先，项目已设计并实现了通信友好的图神经网络安全多方计算基础组件，包括基于复制秘密共享与函数秘密共享的高效矩阵乘、比较与激活函数计算协议，显著降低了多方联合计算的通信开销与交互轮次；然后，项目已构建了可抵抗恶意敌手的图神经网络隐私保护预测与训练框架，引入同态承诺与可验证秘密共享机制等，实现了对恶意数据提供方与恶意计算方的联合防护，并在区块链大模型、外包计算与联邦学习等场景中进行了技术验证；同时，项目已建立统一的安全模型并完成主要协议的形式化安全性证明，验证了所提方案在半诚实与恶意模型下的安全性；最后，项目已完成隐私保护计算模块的工程化与接口化实现，并在 Cora、Citeseer、PubMed 等数据集及多节点仿真环境中进行了系统验证，同时在电子健康推荐、医疗物联网、外包计算、图对抗防御等应用中验证了方案的可用性与有效性。项目共发表学术论文11篇，其中8篇发表于CCF A/B类及IEEE Tra ns等重要国际期刊与会议，申请发明专利3项。相关成果为图神经网络在隐私敏感场景下的安全应用提供了系统性的理论依据与技术支撑。

# Abstract (Brief description of research background, main methods, contributions, and research data):

The project focused on the privacy leakage risks and computational efficiency bottlenecks encountered by graph neural networks in cross-domain multi-source data collaborative modeling. Based on the theory and methods of secure multi-party computation, the project systematically conducted research on key technologies for distributed privacy-preserving computation for graph neural networks, and fully achieved the expected research goals. Firstly, the project has designed and implemented communication-friendly graph neural network secure multi-party computation basic components, including efficient matrix multiplication, comparison, and activation function calculation protocols based on replicated secret sharing and function secret sharing, significantly reducing the communication overhead and interaction rounds of multi-party joint computation; then, the project has constructed a graph neural network privacy protection prediction and training framework that can resist malicious adversaries, introducing homomorphic commitments and verifiable secret sharing mechanisms, achieving joint protection against malicious data providers and malicious calculators, and conducting technical verification in scenarios such as blockchain large models, outsourcing computing, and federated learning; at the same time, the project has established a unified security model and completed the formal security proof of the main protocols, verifying the security of the proposed scheme under semi-honest and malicious models; finally, the project has completed the engineering and interface implementation of the privacy protection computation module, and conducted system verification on datasets such as Cora, Citeseer, and PubMed, as well as multi-node simulation environments. The scheme has also been verified in applications such as electronic health recommendations, medical IoT, outsourcing computing, and graph adversarial defense. The project has published 11 papers, where 8 papers published in CCF A/B journals and conferences and other IEEE Transactions journals, and has applied for 3 invention patents. The related achievements provide systematic theoretical basis and technical support for the secure application of graph neural networks in privacy-sensitive scenarios.

关键词（用分号分开）:隐私保护计算；安全多方计算；通信友好协议；可证明安全；图神经网络

```txt
Keywords (separated by;): Privacy-Preserving Computation; Secure
Multi-party Computation; Communication-Efficient Protocols; Provable
Security; Graph Neural Network
```

## 基金结题报告正文

《结题/成果报告》正文分为两个部分:结题部分和成果部分。请按照《结题/成果报告》填报说明及撰写要求填写。

## （一）结题部分

## 1.研究计划执行情况概述。

## (1) 按计划执行情况。

本项目按照项目研究计划所提出的内容开展工作，完成了申报书所提出的核心研究内容，并取得了相关的研究成果。研究中对图神经网络的数据隐私保护的关键技术做了较为系统的研究，对面向图神经网络的多方计算技术做了较为深入的研究。并在此基础上针对具体应用场景下的隐私保护需求和功能需求设计了数据隐私保护、运行效能并重的安全多方计算协议。针对现有安全多方计算组件存在通信开销过高、计算效率较低等问题设计图结构数据适配的数据安全表达方法，并根据图神经网络模型算法的需求，研究低带宽、少交互的线性安全多方计算基础运算组件以及不依赖多项式近似的高效非线性安全多方计算基础组件；针对现有的图神经网络多方计算方案难以抵抗恶意敌手攻击的问题，研究不同场景对数据安全性、计算效率、网络带宽的差异化需求，构建场景适应的分布式隐私保护计算框架；针对图神经网络隐私保护系统进行安全分析与测试，根据定义的安全模型，给出实例化方案的形式化安全性证明；结合现有的开源密码算法库和图神经网络算法库，研究图神经网络安全多方计算组件的高效实现方法，完成图神经网络隐私保护计算模块的接口化。

项目研究完成原有研究目标，取得比较好的研究成果。研究过程中对核心创新内容发表学术论文11篇，其中CCFA/B、IEEETrans、中科院一/二区期刊/会议论文8篇；申请发明专利3项，其中1项已正式授权。

## (2) 研究目标完成情况。

本项目按照项目研究计划所提出的内容开展工作，完成了申报书所提出的核心研究内容，并取得了相关的研究成果。

## 【研究目标1完成情况】

研究目标1:设计针对线性算子和非线性算子的安全多方计算组件，降低运