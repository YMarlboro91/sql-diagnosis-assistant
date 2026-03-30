import { SkillPackage, DiagnosisContext, DiagnosisResult } from './SkillPackage.js';
import { LogSkill } from './LogSkill.js';
import { JmapSkill } from './JmapSkill.js';
import { JstackSkill } from './JstackSkill.js';
import { JstatSkill } from './JstatSkill.js';
import { QtraceSkill } from './QtraceSkill.js';
import { LinuxSkill } from './LinuxSkill.js';

/**
 * 技能包注册表
 * 管理和调度所有诊断技能包
 */
export class SkillRegistry {
  private skills: Map<string, SkillPackage> = new Map();
  private skillList: SkillPackage[] = [];

  constructor() {
    // 注册所有内置技能包
    this.register(new LogSkill());
    this.register(new JmapSkill());
    this.register(new JstackSkill());
    this.register(new JstatSkill());
    this.register(new QtraceSkill());
    this.register(new LinuxSkill());

    // 按优先级排序
    this.skillList.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 注册技能包
   */
  register(skill: SkillPackage): void {
    this.skills.set(skill.name, skill);
    this.skillList.push(skill);
  }

  /**
   * 获取所有技能包
   */
  getAllSkills(): SkillPackage[] {
    return [...this.skillList];
  }

  /**
   * 获取技能包
   */
  getSkill(name: string): SkillPackage | undefined {
    return this.skills.get(name);
  }

  /**
   * 运行所有适用的诊断
   */
  diagnose(context: DiagnosisContext): Map<string, DiagnosisResult[]> {
    const results = new Map<string, DiagnosisResult[]>();

    for (const skill of this.skillList) {
      if (skill.canAnalyze(context)) {
        try {
          const skillResults = skill.analyze(context);
          if (skillResults.length > 0) {
            results.set(skill.name, skillResults);
          }
        } catch (e) {
          console.error(`Skill ${skill.name} analysis failed:`, e);
        }
      }
    }

    return results;
  }

  /**
   * 获取技能包列表（用于配置界面）
   */
  getSkillDescriptors(): Array<{
    name: string;
    displayName: string;
    supportedLogTypes: string[];
    priority: number;
  }> {
    return this.skillList.map(skill => ({
      name: skill.name,
      displayName: skill.displayName,
      supportedLogTypes: skill.supportedLogTypes,
      priority: skill.priority
    }));
  }
}
