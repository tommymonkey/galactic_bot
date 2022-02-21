const { MessageActionRow, MessageButton } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const errorLog = require('../Utility/logger').logger;


module.exports = {
    data: new SlashCommandBuilder()
        .setName('hunt')
        .setDescription('Hunt Allien!'),

    async execute(interaction, userInfo, serverSettings) {
        String.prototype.format = function () {
            var i = 0, args = arguments;
            return this.replace(/{}/g, function () {
                return typeof args[i] != 'undefined' ? args[i++] : '';
            });
        };

        try {
            let mission = 0;
            if (userInfo.tutorial_counter < 6) {
                mission = await interaction.client.databaseSelcetData("SELECT * FROM user_missions WHERE user_id = ? AND mission_status = 'active'", [interaction.user.id]);
                if (typeof mission == 'undefined' || mission.length == 0) {
                    await interaction.reply({ embeds: [interaction.client.redEmbed(interaction.client.getWordLanguage(serverSettings.lang, 'tutorialFinish'))] });
                    return;
                }
            }
            if (userInfo.user_hp === 0) {
                await interaction.reply({ embeds: [interaction.client.redEmbed(`Please **repair** ship before hunting`, "Ship destroyed!")] });
                return;
            }
            if (userInfo.in_hunt === 1) {
                await interaction.reply({ embeds: [interaction.client.redEmbed(`You are already in a battle`, "Battle in progress...")] });
                return;
            }
            let userCd = await interaction.client.databaseSelcetData("SELECT last_hunt, last_repair, moving_to_map FROM user_cd WHERE user_id = ?", [interaction.user.id]);
            let elapsedTimeFromHunt = Math.floor((Date.now() - Date.parse(userCd[0].last_hunt)) / 1000);
            if (elapsedTimeFromHunt < 60) {
                await interaction.reply({ embeds: [interaction.client.redEmbed(interaction.client.getWordLanguage(serverSettings.lang, 'huntCD').format(60 - elapsedTimeFromHunt), interaction.client.getWordLanguage(serverSettings.lang, 'inCD'))] });
                return;
            }

            let resourcesName = ["Rhodochrosite ", "Linarite      ", "Dolomite      ", "Rubellite     ", "Prehnite      ", "Diamond       ", "Radtkeite     ", "Dark Matter   ", "Gold          "]
            let maxCargo = userInfo.max_cargo;
            let cargo = userInfo.cargo;
            let damageDealt = 0;
            let damageReceived = 0;

            let mapId = 1;
            if (Math.floor((Date.now() - Date.parse(userCd[0].moving_to_map)) / 1000) >= 0 && userInfo.next_map_id !== 1) {
                mapId = userInfo.next_map_id;
                await interaction.client.databaseEditData("UPDATE users SET map_id = ?, next_map_id = 1 WHERE user_id = ?", [mapId, interaction.user.id]);
            }
            else
                mapId = userInfo.map_id;
            let huntConfiguration = await interaction.client.databaseSelcetData("SELECT * FROM hunt_configuration WHERE user_id = ?", [interaction.user.id]);
            let aliens = 0;
            if (huntConfiguration[0].mothership === 1)
                aliens = await interaction.client.databaseSelcetData("SELECT * FROM aliens WHERE map_id = ?", [mapId]);
            else
                aliens = await interaction.client.databaseSelcetData("SELECT * FROM aliens WHERE map_id = ? and mothership = 0", [mapId]);

            if (typeof aliens[0] === 'undefined') {
                await interaction.reply({ embeds: [interaction.client.redEmbed("**No aliens found**", "ERROR!")] });
                return;
            }

            await interaction.client.databaseEditData("UPDATE users SET in_hunt = 1 WHERE user_id = ?", [interaction.user.id]);
            let [credit, units, expReward, honor, resources] = [0, 0, 0, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0]];
            let ammunition = await interaction.client.databaseSelcetData("SELECT * FROM ammunition WHERE user_id = ?", [interaction.user.id]);

            let alienNameChecker = 0;
            let alienNameIndex = 0;
            let missionTask = 0;
            let missionTaskLeft = 0;
            let countMission = false;
            mission = await interaction.client.databaseSelcetData("SELECT * FROM user_missions INNER JOIN missions ON user_missions.mission_id = missions.mission_id WHERE user_missions.user_id = ? AND user_missions.mission_status = 'active'", [interaction.user.id]);
            let runRow = battleButtonHandler();
            if (typeof mission !== 'undefined' && mission.length > 0) {
                missionTask = mission[0].mission_task.split(";");
                missionTaskLeft = mission[0].mission_task_left.split(";").map(Number);

                if (mission[0].mission_limit > 0) {
                    let missionEndTime = Date.parse(mission[0].mission_started_at) + (mission[0].mission_limit * 60 * 60 * 1000);
                    let currentTime = new Date().getTime();

                    let distance = missionEndTime - currentTime;
                    if (distance < 0) {
                        await interaction.client.databaseEditData(`update user_missions set mission_status = ? where user_id = ? and id = ?`, ["expired", interaction.user.id, userInfo.missions_id])
                        mission[0].map_id = -99;
                        missionTaskLeft = 0;
                    }
                }
                if (mission[0].map_id === 0 || mission[0].map_id === userInfo.map_id) {
                    countMission = true;
                }
            }




            let expRequirement = await interaction.client.databaseSelcetData("SELECT exp_to_lvl_up FROM level WHERE level = ?", [userInfo.level]);
            expRequirement = expRequirement[0].exp_to_lvl_up;
            await interaction.client.databaseEditData("UPDATE user_cd SET last_hunt = ? WHERE user_id = ?", [new Date(), interaction.user.id]);
            //let user_ammo = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 25, 15, 5];
            //[a, b, c, d] = [threshold, damage, "shield damage", user_ammo]
            //[a] -3 <= DISABLED, -2 <= NO AMMO, -1 <= ONLY FOR X1, 0 <= USE THAT AMMUNITION TILL ALIEN DIES
            let userLaserConfig = [[huntConfiguration[0].x2, 2, 0, ammunition[0].x2_magazine, "x2"], [huntConfiguration[0].x1, 1, 0, ammunition[0].x1_magazine, "x1"], [huntConfiguration[0].x3, 3, 0, ammunition[0].x4_magazine, "x3"], [huntConfiguration[0].x4, 4, 0, ammunition[0].x4_magazine, "x4"], [huntConfiguration[0].xS1, 0, 2, ammunition[0].xS1_magazine, "xS1"]];
            let userMissileConfig = [[huntConfiguration[0].m1, 1000, ammunition[0].m1_magazine, "m1"], [huntConfiguration[0].m2, 2000, ammunition[0].m2_magazine, "m2"], [huntConfiguration[0].m3, 4000, ammunition[0].m3_magazine, "m3"], [huntConfiguration[0].m4, 6000, ammunition[0].m4_magazine, "m4"]];
            let userHellstormConfig = [[huntConfiguration[0].h1, 2000, 0, ammunition[0].h1_magazine, "h1"], [huntConfiguration[0].h2, 4000, 0, ammunition[0].h2_magazine, "h2"], [huntConfiguration[0].hS1, 0, 2500, ammunition[0].hS1_magazine, "hS1"], [huntConfiguration[0].hS2, 0, 5000, ammunition[0].hS2_magazine, "hS2"]];

            // Damage, HP, Max Shield,  Shield, Speed, Penetration, Shield absorb rate, laser quantity   
            let userHp = Math.trunc(userInfo.user_hp + userInfo.repair_rate * (Date.now() - Date.parse(userCd[0].last_repair)) / 60000)
            if (userHp > userInfo.max_hp)
                userHp = userInfo.max_hp;
            let userStats = [userInfo.user_damage, userHp, userInfo.max_shield, userInfo.user_shield, userInfo.user_speed, userInfo.user_penetration / 100, userInfo.absorption_rate / 100, userInfo.laser_quantity];

            if (shipModel === "S5") {
                if (mapIDSecond < 5 && ((userInfo.firm === "Luna" && mapIDFrist == 2) || (userInfo.firm === "Terra" && mapIDFrist == 1) || (userInfo.firm === "Marte" && mapIDFrist == 3))) {
                    userStats[1] += 60000;
                    userStats[0] *= 2;
                    userStats[2] *= 2;
                    userStats[3] *= 2;
                }
            }
            let boost = await interaction.client.databaseSelcetData("SELECT * FROM boost WHERE user_id = ?", [interaction.user.id]);

            if (Math.floor((Date.now() - Date.parse(boost[0].hp_boost)) / 1000) < 0)
                userStats[1] = Math.floor(userStats[1] * 1.1);
            if (Math.floor((Date.now() - Date.parse(boost[0].damage_boost)) / 1000) < 0)
                userStats[0] = Math.floor(userStats[0] * 1.1);
            if (Math.floor((Date.now() - Date.parse(boost[0].shield_boost)) / 1000) < 0) {
                userStats[2] = Math.floor(userStats[2] * 1.2);
                userStats[3] = Math.floor(userStats[3] * 1.2);
            }
            let expBoost = false;
            let honorBoost = false;
            if (Math.floor((Date.now() - Date.parse(boost[0].exp_boost)) / 1000) < 0)
                expBoost = true;
            if (Math.floor((Date.now() - Date.parse(boost[0].honor_boost)) / 1000) < 0)
                honorBoost = true;

            let enemyStats = await getAlien(aliens, huntConfiguration[0].mothership);
            aliens = await interaction.client.databaseSelcetData("SELECT * FROM aliens WHERE map_id = ? AND mothership = 0", [mapId]);
            await interaction.reply({ embeds: [interaction.client.blueEmbed("", "Looking for an aliens...")] });
            await interaction.client.wait(1000);
            let alienList = [enemyStats];
            let messageReward = "\`\`\`yaml\n";
            let messageDamage = "";
            let message = `\n**Your Info**:\nHP: **${userStats[1]}**\tShield: **${userStats[3]}**`;
            message += `\n**Alien Info**:\nHP: **${enemyStats[1]}**\tShield: **${enemyStats[2]}**`;

            let emojiMessage = `\n**Your Info**:\n**[${shipEmiji}]** <a:hp:896118360125870170>: **${userStats[1]}**\t<a:sd:896118359966511104>: **${userStats[3]}**\n`;
            emojiMessage += `\n**Alien Info**:\n**[${enemyStats[12]}]** <a:hp:896118360125870170>: **${enemyStats[1]}**\t<a:sd:896118359966511104>: **${enemyStats[2]}**`;
            await interaction.editReply({ embeds: [interaction.client.blueEmbed(emojiMessage, `**Engaging Combat with ->|${enemyStats[6]}|<-**`)], components: [runRow] });
            await interaction.client.wait(1000);

            let logMessage = [[message, `**Engaging Combat with ->|${enemyStats[6]}|<-**`]];
            let messageAmmo = "";
            userLaserConfig.push([-2, 0, 0, 1000000, "No AMMO"]);
            userLaserConfig = userLaserConfig.sort(function (a, b) {
                return a[0] - b[0];
            });
            let laserCounter = userLaserConfig.length - 1;
            userMissileConfig.push([-2, 0, 100000, "No AMMO"]);
            userMissileConfig = userMissileConfig.sort(function (a, b) {
                return a[0] - b[0];
            });
            let missileCounter = userMissileConfig.length - 1;
            userHellstormConfig.push([-2, 0, 0, 100000, "No AMMO"]);
            userHellstormConfig = userHellstormConfig.sort(function (a, b) {
                return a[0] - b[0];
            });
            let hellstormCounter = userHellstormConfig.length - 1;

            let missileLaunchAfterTurns = 3;
            let laser = userLaserConfig[laserCounter];
            let missile = userMissileConfig[missileCounter];
            let hellstorm = userHellstormConfig[hellstormCounter];
            let turnCounter = 0;

            let canUseHellstorm = true;
            if (huntConfiguration[0].hellstorm == 0) {
                canUseHellstorm = false;
            }
            let canUseMissile = true;
            if (huntConfiguration[0].missile == 0) {
                canUseMissile = false;
            }

            let userMaxShield = userStats[2];

            let totalAliensDamage = enemyStats[0];

            if (enemyStats[13] + enemyStats[14] < 12000 || enemyStats[13] / userStats[0] <= 7 || !canUseHellstorm) {
                canUseHellstorm = false;
                hellstorm = [0, 0, 0, 100000, "Disabled"];
            }
            if (!canUseMissile)
                missile = [0, 0, 100000, "Disabled"];
            let minimumAccuracyUser = 80;
            let minimumAccuracyAlien = 80;

            if (userStats[4] > enemyStats[3]) {
                minimumAccuracyUser = 90 - (userStats[4] - enemyStats[3]) / 5;
                minimumAccuracyAlien = 85 + (enemyStats[3] - userStats[4]) / 2.5;
            }
            else if (userStats[4] == enemyStats[3]) {
                minimumAccuracyUser = 80;
                minimumAccuracyAlien = 80;
            }
            else {
                minimumAccuracyUser = 85 + (enemyStats[3] - userStats[4]) / 2.5;
                minimumAccuracyAlien = 90 - (userStats[4] - enemyStats[3]) / 5;
            }

            const filterRun = iRun => iRun.user.id === interaction.user.id && iRun.message.interaction.id === interaction.id;
            const collectorRun = interaction.channel.createMessageComponentCollector({ filterRun, time: 25000 });
            let run = false;
            collectorRun.on('collect', async iRun => {
                collectorRun.resetTimer({ time: 25000 });

                if (iRun.customId === "Run") {
                    run = true;
                    iRun.update({ embeds: [interaction.client.blueEmbed("**Initializing escape command...**", `**Loading**`)], components: [] });
                    await interaction.client.wait(1000);
                    collectorRun.stop();
                }
                else if (iRun.customId === "NextAlien" && alienList.length > 0) {
                    emojiMessage = `*Turn* ***${turnCounter}***\n**Your Info**:\n**[${shipEmiji}]** <a:hp:896118360125870170>: **${userStats[1]}**\t<a:sd:896118359966511104>: **${userStats[3]}**\n`;
                    emojiMessage += `**Total dealt damage: __${damageDealt}__**\n`;
                    damageDealt = 0;
                    emojiMessage += "\n**Alien Info**:\n";
                    let storedAlien = alienList[0];
                    alienList.shift();
                    alienList.push(storedAlien);
                    emojiMessage += "<:aim:902625135050235994>";
                    for (let index in alienList) {
                        emojiMessage += `**[${alienList[index][12]}]** <a:hp:896118360125870170>: **${alienList[index][1]}**\t<a:sd:896118359966511104>: **${alienList[index][2]}**\n<:Transparent:902212836770598922>`;
                    }
                    emojiMessage += `**Total received damage: __${damageReceived}__**`;
                    damageReceived = 0;
                    iRun.update({ embeds: [interaction.client.blueEmbed(emojiMessage, `**In Combat with ${alienList[0][6]}**`)] });

                    laserCounter = userLaserConfig.length - 1;
                    missileCounter = userMissileConfig.length - 1;
                    hellstormCounter = userHellstormConfig.length - 1;
                    laser = userLaserConfig[laserCounter];
                    missile = userMissileConfig[missileCounter];
                    hellstorm = userHellstormConfig[hellstormCounter];

                    if (alienList[0][13] + alienList[0][14] < 12000 || alienList[0][13] / userStats[0] <= 7) {
                        canUseHellstorm = false;
                        hellstorm = [-1, 0, 0, 100000, "Disabled"];
                    }
                    else if (huntConfiguration[0].hellstorm != 0)
                        canUseHellstorm = true;

                    if (userStats[4] > alienList[0][3]) {
                        minimumAccuracyUser = 90 - (userStats[4] - alienList[0][3]) / 5;
                        minimumAccuracyAlien = 85 + (alienList[0][3] - userStats[4]) / 2.5;
                    }
                    else if (userStats[4] == alienList[0][3]) {
                        minimumAccuracyUser = 80;
                        minimumAccuracyAlien = 80;
                    }
                    else {
                        minimumAccuracyUser = 85 + (alienList[0][3] - userStats[4]) / 2.5;
                        minimumAccuracyAlien = 90 - (userStats[4] - alienList[0][3]) / 5;
                    }
                    await interaction.client.wait(1000);
                }
            });

            let alienStats = alienList[0];
            let accuracyUser = 0;
            let accuracyAlien = 0;
            let hasLaserAmmo = 0;
            let hasMissileAmmo = 0;
            let hasHellstormAmmo = 0;

            let laserShieldAbsorption = 0;
            let laserShieldDamage = 0;
            let laserHpDamage = 0;
            let missileHpDamage = 0;
            let missileShieldDamage = 0;
            let hellstormHpDamage = 0;
            let hellstormShieldDamage = 0;
            let hellstormShieldAbsorption = 0;

            let threshold = 0;
            let new_threshold = 0;
            let chance_to_encounter_new_alien = 0;

            while (userStats[1] > 0 && alienList.length > 0) {
                if (run)
                    break;
                alienStats = alienList[0];
                accuracyUser = interaction.client.random(minimumAccuracyUser, 100) / 100;
                accuracyAlien = interaction.client.random(minimumAccuracyAlien, 100) / 100;
                turnCounter += 1;
                hasLaserAmmo = laser[3] / userStats[7] >= 1;
                hasMissileAmmo = missile[2] / 2 >= 1;
                hasHellstormAmmo = hellstorm[3] / 5 >= 1;

                laserShieldAbsorption = 0;
                laserShieldDamage = 0;
                laserHpDamage = 0;
                missileHpDamage = 0;
                missileShieldDamage = 0;
                hellstormHpDamage = 0;
                hellstormShieldDamage = 0;
                hellstormShieldAbsorption = 0;

                threshold = 100 / alienStats[13] * alienStats[1] + 100 / alienStats[14] * alienStats[2];

                while (!hasLaserAmmo || threshold <= laser[0]) {
                    if (!hasLaserAmmo) {
                        messageAmmo += `\n- Laser (${laser[4]}) out of AMMO`;
                        userLaserConfig.splice(laserCounter, 1);
                    }
                    laserCounter -= 1;
                    laser = userLaserConfig[laserCounter];
                    hasLaserAmmo = laser[3] / userStats[7] >= 1;
                }

                if (canUseMissile)
                    while (!hasMissileAmmo || threshold <= missile[0]) {
                        if (!hasMissileAmmo) {
                            messageAmmo += `\n- Missile (${missile[3]}) out of AMMO`;
                            userMissileConfig.splice(missileCounter, 1);
                        }
                        missileCounter -= 1;
                        missile = userMissileConfig[missileCounter];
                        hasMissileAmmo = missile[2] >= 1;
                    }

                if (canUseHellstorm)
                    while (!hasHellstormAmmo || threshold <= hellstorm[0]) {
                        if (!hasHellstormAmmo) {
                            messageAmmo += `\n- Hellstorm (${hellstorm[4]}) out of AMMO`;
                            userHellstormConfig.splice(hellstormCounter, 1);
                        }
                        hellstormCounter -= 1;
                        hellstorm = userHellstormConfig[hellstormCounter];
                        hasHellstormAmmo = hellstorm[3] / 5 >= 1;
                    }

                if (alienStats[2] > 0) {
                    laser[3] -= userStats[7];
                    laserShieldAbsorption = Math.trunc(laser[2] * userStats[0] * accuracyUser);
                    laserShieldDamage = Math.trunc((alienStats[5] - userStats[5]) * laser[1] * userStats[0] * accuracyUser);
                    laserHpDamage = Math.trunc(laser[1] * userStats[0] * accuracyUser - laserShieldDamage);
                    if (alienStats[2] <= laserShieldAbsorption) {
                        userStats[3] += alienStats[2];
                        laserShieldAbsorption = Math.trunc(alienStats[2] * accuracyUser);
                        alienStats[2] = 0;
                        laserHpDamage = laser[1] * userStats[0];
                    }
                    else {
                        userStats[3] += laserShieldAbsorption;
                        alienStats[2] -= laserShieldAbsorption;
                        if (alienStats[2] <= laserShieldDamage) {
                            laserHpDamage += laserShieldDamage - alienStats[2];
                            laserShieldDamage = alienStats[2] + laserShieldAbsorption;
                            alienStats[2] = 0;
                        }
                        else {
                            alienStats[2] -= laserShieldDamage;
                            laserShieldDamage += laserShieldAbsorption;
                        }
                    }
                    alienStats[1] -= laserHpDamage;
                    messageDamage = `\n\`\`\`ini\n[Laser Damage (${laser[4]}): ${laserHpDamage}/${laserShieldDamage}]`;

                    if (turnCounter % missileLaunchAfterTurns == 0 && canUseMissile) {
                        missile[2] -= 1;
                        missileShieldDamage = Math.trunc((alienStats[5] - userStats[5]) * missile[1] * accuracyUser);
                        missileHpDamage = Math.trunc(missile[1] * accuracyUser - missileShieldDamage);
                        if (alienStats[2] <= missileShieldDamage) {
                            missileHpDamage += missileShieldDamage - alienStats[2];
                            missileShieldDamage = alienStats[2];
                            alienStats[2] = 0;
                        }
                        else
                            alienStats[2] -= missileShieldDamage;
                        alienStats[1] -= missileHpDamage;
                        messageDamage += `\n[Missile Damage (${missile[3]}): ${missileHpDamage}/${missileShieldDamage}]`;
                    }
                    if (canUseHellstorm && turnCounter % 6 == 0) {
                        hellstorm[3] -= huntConfiguration[0].hellstorm;
                        hellstormShieldAbsorption = Math.trunc(hellstorm[2] * accuracyUser * huntConfiguration[0].hellstorm);
                        hellstormShieldDamage = Math.trunc((alienStats[5] - userStats[5]) * hellstorm[1] * accuracyUser * huntConfiguration[0].hellstorm);
                        hellstormHpDamage = Math.trunc(hellstorm[1] * accuracyUser * huntConfiguration[0].hellstorm - hellstormShieldDamage);
                        if (alienStats[2] <= hellstormShieldAbsorption) {
                            userStats[3] += alienStats[2];
                            hellstormShieldAbsorption = alienStats[2];
                            alienStats[2] = 0;
                            hellstormHpDamage = hellstorm[1];
                        }
                        else {
                            userStats[3] += hellstormShieldAbsorption;
                            alienStats[2] -= hellstormShieldAbsorption;
                            if (alienStats[2] <= hellstormShieldDamage) {
                                hellstormHpDamage += hellstormShieldDamage - alienStats[2];
                                hellstormShieldDamage = alienStats[2] + hellstormShieldAbsorption;
                                alienStats[2] = 0;
                            }
                            else {
                                alienStats[2] -= hellstormShieldDamage;
                                hellstormShieldDamage += hellstormShieldAbsorption;
                            }
                        }
                        alienStats[1] -= hellstormHpDamage;
                        messageDamage += `\n[Hellstorm Damage (${hellstorm[4]}): ${hellstormHpDamage}/${hellstormShieldDamage}]`;
                    }
                }
                else {
                    laser[3] -= userStats[7];
                    laserHpDamage = Math.trunc(laser[1] * userStats[0] * accuracyUser);
                    alienStats[1] -= laserHpDamage;
                    messageDamage = `\n\`\`\`ini\n[Laser Damage (${laser[4]}): ${laserHpDamage}/0]`;

                    if (turnCounter % missileLaunchAfterTurns == 0 && canUseMissile) {
                        missile[2] -= 1;
                        missileHpDamage = Math.trunc(missile[1] * accuracyUser);
                        alienStats[1] -= missileHpDamage;
                        messageDamage += `\n[Missile Damage (${missile[3]}): ${missileHpDamage}/0]`;
                    }

                    if (turnCounter % 6 == 0 && canUseHellstorm) {
                        hellstorm[3] -= huntConfiguration[0].hellstorm;
                        hellstormHpDamage = Math.trunc(hellstorm[1] * accuracyUser * huntConfiguration[0].hellstorm);
                        alienStats[1] -= hellstormHpDamage;
                        messageDamage += `\n[Hellstorm Damage (${hellstorm[4]}): ${hellstormHpDamage}/0]`;
                    }
                }

                damageDealt += laserShieldDamage + laserHpDamage + missileShieldDamage + missileHpDamage + hellstormHpDamage + hellstormShieldDamage;
                damageReceived += Math.trunc(totalAliensDamage * accuracyAlien);

                let alien_shield_damage = Math.trunc((userStats[6] - alienStats[4]) * totalAliensDamage * accuracyAlien);
                let alien_hp_damage = Math.trunc(totalAliensDamage * accuracyAlien - alien_shield_damage);
                if (userStats[3] <= alien_shield_damage) {
                    alien_hp_damage += alien_shield_damage - userStats[3];
                    alien_shield_damage = userStats[3];
                    userStats[3] = 0;
                }
                else
                    userStats[3] -= alien_shield_damage;
                userStats[1] -= alien_hp_damage;
                if (userStats[3] > userMaxShield)
                    userStats[3] = userMaxShield;

                if (alienStats[1] <= 0) {

                    if (countMission) {
                        alienNameChecker = (x) => x == alienStats[6];
                        alienNameIndex = missionTask.findIndex(alienNameChecker)
                        if (alienNameIndex > -1 && missionTaskLeft[alienNameIndex] > 0) {
                            missionTaskLeft[alienNameIndex]--;

                            for (let item in missionTaskLeft) {
                                if (missionTaskLeft[item] == 0)
                                    countMission = false;
                                else
                                    countMission = true;
                            }
                            if (!countMission) {
                                expReward += mission[0].mission_reward_exp;
                                credit += mission[0].mission_reward_credit;
                                units += mission[0].mission_reward_units;
                                honor += mission[0].mission_reward_honor;
                                missionTaskLeft = -5;

                                if (honorBoost && expBoost)
                                    messageReward += `EXP           :  ${mission[0].mission_reward_exp} + [${Math.floor(mission[0].mission_reward_exp * 0.1)}]\nCredits       :  ${mission[0].mission_reward_credit}\nUnits         :  ${mission[0].mission_reward_units}\nHonor         :  ${mission[0].mission_reward_honor} + [${Math.floor(mission[0].mission_reward_honor * 0.1)}]` + " \`\`\`";
                                else if (honorBoost)
                                    messageReward += `EXP           :  ${mission[0].mission_reward_exp}\nCredits       :  ${mission[0].mission_reward_credit}\nUnits         :  ${mission[0].mission_reward_units}\nHonor         :  ${mission[0].mission_reward_honor} + [${Math.floor(mission[0].mission_reward_honor * 0.1)}]` + " \`\`\`";
                                else if (expBoost)
                                    messageReward += `EXP           :  ${mission[0].mission_reward_exp} + [${Math.floor(mission[0].mission_reward_exp * 0.1)}]\nCredits       :  ${mission[0].mission_reward_credit}\nUnits         :  ${mission[0].mission_reward_units}\nHonor         :  ${mission[0].mission_reward_honor}` + " \`\`\`";
                                else
                                    messageReward += `EXP           :  ${mission[0].mission_reward_exp}\nCredits       :  ${mission[0].mission_reward_credit}\nUnits         :  ${mission[0].mission_reward_units}\nHonor         :  ${mission[0].mission_reward_honor}` + " \`\`\`";

                                await interaction.followUp({ embeds: [interaction.client.yellowEmbed(messageReward, "Mission Completed!")] });
                                await interaction.client.databaseEditData(`update user_missions set mission_status = ? where user_id = ? and id = ?`, ["completed", interaction.user.id, mission[0].id])
                            }
                        }
                    }

                    alienStats[1] = 0;
                    totalAliensDamage -= alienStats[0];
                    credit += alienStats[7];
                    units += alienStats[8];
                    expReward += alienStats[9];
                    honor += alienStats[10];
                    let totalResources = alienStats[11].reduce((a, b) => a + b) + resources.reduce((a, b) => a + b) + cargo;
                    if (totalResources <= maxCargo) {
                        resources = resources.map(function (num, idx) { return num + alienStats[11][idx]; });
                    }
                    else {
                        let difference = maxCargo - cargo - resources.reduce((a, b) => a + b);
                        let index = 0;
                        while (difference > 0) {
                            difference -= alienStats[11][index];
                            if (difference >= 0) {
                                resources[index] += alienStats[11][index];
                                index++;
                            }
                            else {
                                resources[index] += difference;
                            }
                        }
                    }

                    alienList.shift();
                    if (alienList.length > 1) {
                        runRow = battleButtonHandler(true);
                    }
                    else {
                        runRow = battleButtonHandler();
                    }

                    if (alienList.length > 0) {

                        laserCounter = userLaserConfig.length - 1;
                        missileCounter = userMissileConfig.length - 1;
                        hellstormCounter = userHellstormConfig.length - 1;
                        laser = userLaserConfig[laserCounter];
                        missile = userMissileConfig[missileCounter];
                        hellstorm = userHellstormConfig[hellstormCounter];

                        if (alienList[0][13] + alienList[0][14] < 12000 || alienList[0][13] / userStats[0] <= 7) {
                            canUseHellstorm = false;
                            hellstorm = [-1, 0, 0, 100000, "Disabled"];
                        }
                        else if (huntConfiguration[0].hellstorm != 0)
                            canUseHellstorm = true;

                        if (userStats[4] > alienStats[3]) {
                            minimumAccuracyUser = 90 - (userStats[4] - alienStats[3]) / 5;
                            minimumAccuracyAlien = 85 + (alienStats[3] - userStats[4]) / 2.5;
                        }
                        else if (userStats[4] == alienStats[3]) {
                            minimumAccuracyUser = 80;
                            minimumAccuracyAlien = 80;
                        }
                        else {
                            minimumAccuracyUser = 85 + (alienStats[3] - userStats[4]) / 2.5;
                            minimumAccuracyAlien = 90 - (userStats[4] - alienStats[3]) / 5;
                        }
                    }
                }
                new_threshold = 100 / alienStats[13] * alienStats[1] + 100 / alienStats[14] * alienStats[2];
                chance_to_encounter_new_alien = (threshold - new_threshold - (turnCounter - 1) * 40) / 2;

                if (chance_to_encounter_new_alien < 10 && turnCounter <= 11)
                    chance_to_encounter_new_alien = 10;
                else if (chance_to_encounter_new_alien < 0)
                    chance_to_encounter_new_alien = 0;

                chance_to_encounter_new_alien = Array(chance_to_encounter_new_alien).fill(true).concat(Array(100 - chance_to_encounter_new_alien).fill(false)).sort(() => Math.random() - 0.5)[Math.floor(Math.random() * 100)]


                message = `\n**Your Info**:\nHP: **${userStats[1]}**\tShield: **${userStats[3]}**`;
                message += `\n**Alien Info**:\nHP: **${alienStats[1]}**\tShield: **${alienStats[2]}**`;

                messageDamage += `\`\`\`**\`\`\`diff\n+ ${laserShieldAbsorption + hellstormShieldAbsorption} Shield Absorbed`;
                messageDamage += `\`\`\`**\`\`\`css\n[Alien Damage: ${alien_hp_damage}/${alien_shield_damage}]\`\`\``;
                logMessage.push([message + messageDamage, `__Turn ${turnCounter}__`]);

                if (chance_to_encounter_new_alien) {
                    await interaction.client.wait(1000);
                    runRow = battleButtonHandler(true);

                    if (run)
                        break;
                    let newAlien = await getAlien(aliens);
                    alienList.push(newAlien.slice());
                    totalAliensDamage += newAlien[0];
                    await interaction.editReply({ embeds: [interaction.client.yellowEmbed("\`\`\`json\n\"NEW ALIEN ENCOUNTERED !!!\"\n\`\`\`")], components: [] });
                    logMessage[turnCounter][0] += `\n\`\`\`json\n\"${newAlien[6]} joined the fight !!!\"\n\`\`\``;
                    await interaction.client.wait(1000);
                    if (run)
                        break;
                    if (turnCounter % 6 != 0 && alienList.length > 0) {
                        emojiMessage = `*Turn* ***${turnCounter}***\n**Your Info**:\n**[${shipEmiji}]** <a:hp:896118360125870170>: **${userStats[1]}**\t<a:sd:896118359966511104>: **${userStats[3]}**\n`;
                        emojiMessage += `**Total dealt damage: __${damageDealt}__**\n`;
                        damageDealt = 0;
                        emojiMessage += "\n**Alien Info**:\n";
                        emojiMessage += "<:aim:902625135050235994>";
                        for (let index in alienList) {
                            emojiMessage += `**[${alienList[index][12]}]** <a:hp:896118360125870170>: **${alienList[index][1]}**\t<a:sd:896118359966511104>: **${alienList[index][2]}**\n<:Transparent:902212836770598922>`;
                        }
                        emojiMessage += `**Total received damage: __${damageReceived}__**`;
                        damageReceived = 0;
                        await interaction.editReply({ embeds: [interaction.client.blueEmbed(emojiMessage, `**In Combat with ${alienStats[6]}**`)], components: [runRow] });
                        await interaction.client.wait(1000);
                    }
                }
                if (turnCounter % 6 == 0 && alienList.length > 0) {
                    emojiMessage = `*Turn* ***${turnCounter}***\n**Your Info**:\n**[${shipEmiji}]** <a:hp:896118360125870170>: **${userStats[1]}**\t<a:sd:896118359966511104>: **${userStats[3]}**\n`;
                    emojiMessage += `**Total dealt damage: __${damageDealt}__**\n`;
                    damageDealt = 0;
                    emojiMessage += "\n**Alien Info**:\n";
                    emojiMessage += "<:aim:902625135050235994>";
                    for (let index in alienList) {
                        emojiMessage += `**[${alienList[index][12]}]** <a:hp:896118360125870170>: **${alienList[index][1]}**\t<a:sd:896118359966511104>: **${alienList[index][2]}**\n<:Transparent:902212836770598922>`;
                    }
                    emojiMessage += `**Total received damage: __${damageReceived}__**`;
                    damageReceived = 0;
                    await interaction.editReply({ embeds: [interaction.client.blueEmbed(emojiMessage, `**In Combat with ${alienStats[6]}**`)], components: [runRow] });
                    await interaction.client.wait(1000);
                }
            }
            let messageUserInfo = `**Battle ended after ${turnCounter} turns**\n`;
            messageUserInfo += `**Your Info**:\nHP: **${userStats[1]}**\tShield: **${userStats[3]}**`;

            messageReward = "\`\`\`yaml\n";
            if (missionTaskLeft == -5) {
                if (honorBoost && expBoost) {
                    messageReward += `EXP           :  ${expReward - mission[0].mission_reward_exp} + [${Math.floor((expReward - mission[0].mission_reward_exp) * 0.1)}]\nCredits       :  ${credit - mission[0].mission_reward_credit}\nUnits         :  ${units - mission[0].mission_reward_units}\nHonor         :  ${honor - mission[0].mission_reward_honor} + [${Math.floor((honor - mission[0].mission_reward_honor) * 0.1)}]` + " \`\`\`";
                    expReward = Math.floor(expReward * 1.1);
                    honor = Math.floor(honor * 1.1);
                }
                else if (honorBoost) {
                    messageReward += `EXP           :  ${expReward - mission[0].mission_reward_exp}\nCredits       :  ${credit - mission[0].mission_reward_credit}\nUnits         :  ${units - mission[0].mission_reward_units}\nHonor         :  ${honor - mission[0].mission_reward_honor} + [${Math.floor((honor - mission[0].mission_reward_honor) * 0.1)}]` + " \`\`\`";
                    honor = Math.floor(honor * 1.1);
                }
                else if (expBoost) {
                    messageReward += `EXP           :  ${expReward - mission[0].mission_reward_exp} + [${Math.floor((expReward - mission[0].mission_reward_exp) * 0.1)}]\nCredits       :  ${credit - mission[0].mission_reward_credit}\nUnits         :  ${units - mission[0].mission_reward_units}\nHonor         :  ${honor - mission[0].mission_reward_honor}` + " \`\`\`";
                    expReward = Math.floor(expReward * 1.1);
                }
                else
                    messageReward += `EXP           :  ${expReward - mission[0].mission_reward_exp}\nCredits       :  ${credit - mission[0].mission_reward_credit}\nUnits         :  ${units - mission[0].mission_reward_units}\nHonor         :  ${honor - mission[0].mission_reward_honor}`;
            }
            else {
                if (honorBoost && expBoost) {
                    messageReward += `EXP           :  ${expReward} + [${Math.floor(expReward * 0.1)}]\nCredits       :  ${credit}\nUnits         :  ${units}\nHonor         :  ${honor} + [${Math.floor(honor * 0.1)}]`;
                    expReward = Math.floor(expReward * 1.1);
                    honor = Math.floor(honor * 1.1);
                }
                else if (honorBoost) {
                    messageReward += `EXP           :  ${expReward}\nCredits       :  ${credit}\nUnits         :  ${units}\nHonor         :  ${honor} + [${Math.floor(honor * 0.1)}]`;
                    honor = Math.floor(honor * 1.1);
                }
                else if (expBoost) {
                    messageReward += `EXP           :  ${expReward} + [${Math.floor(expReward * 0.1)}]\nCredits       :  ${credit}\nUnits         :  ${units}\nHonor         :  ${honor}`;
                    expReward = Math.floor(expReward * 1.1);
                }
                else
                    messageReward += `EXP           :  ${expReward}\nCredits       :  ${credit}\nUnits         :  ${units}\nHonor         :  ${honor}`;
            }
            for (let item in resources) {
                if (resources[item] > 0)
                    messageReward += `\n${resourcesName[item]}:  ${resources[item]}`;
            }
            messageReward += " \`\`\`";
            if (run) {
                let escapeTurns = Math.floor((462 + enemyStats[3]) / userInfo.user_speed * 3);
                let escapeDamage = 0;
                alienStats = alienList[0];
                let alien_shield_damage = 0;
                let alien_hp_damage = 0;
                while (userStats[1] > 0 && escapeTurns > 0) {
                    escapeTurns--;
                    turnCounter++;
                    accuracyAlien = interaction.client.random(minimumAccuracyAlien, 100) / 100;
                    escapeDamage = Math.trunc(totalAliensDamage * accuracyAlien);

                    alien_shield_damage = Math.trunc((userStats[6] - alienStats[4]) * escapeDamage);
                    alien_hp_damage = Math.trunc(escapeDamage - alien_shield_damage);
                    if (userStats[3] <= alien_shield_damage) {
                        alien_hp_damage += alien_shield_damage - userStats[3];
                        alien_shield_damage = userStats[3];
                        userStats[3] = 0;
                    }
                    else
                        userStats[3] -= alien_shield_damage;
                    userStats[1] -= alien_hp_damage;

                    let escapeEmojiMessage = `*Turn* ***${turnCounter}***\n**Your Info**:\n**[${shipEmiji}]** <a:hp:896118360125870170>: **${userStats[1]}**\t<a:sd:896118359966511104>: **${userStats[3]}**\n`;
                    escapeEmojiMessage += "\n**Alien Info**:\n";
                    for (let index in alienList) {
                        escapeEmojiMessage += `**[${alienList[index][12]}]** <a:hp:896118360125870170>: **${alienList[index][1]}**\t<a:sd:896118359966511104>: **${alienList[index][2]}**\n`;
                    }
                    escapeEmojiMessage += `**Total received damage: __${escapeDamage}__**`;
                    messageUserInfo = `**Battle ended after ${turnCounter} turns**\n`;
                    messageUserInfo += `**Your Info**:\nHP: **${userStats[1]}**\tShield: **${userStats[3]}**`;
                    await interaction.editReply({ embeds: [interaction.client.redEmbed(escapeEmojiMessage, `**Fleeing...**`)] });
                    await interaction.client.wait(1000);
                }
                if (userStats[1] > 0) {
                    await interaction.editReply({ embeds: [interaction.client.greenEmbed(messageUserInfo + "\`\`\`diff\n" + messageAmmo + " \`\`\`" + messageReward, "ESCAPE SUCCESSFULLY")], components: [row] });
                    logMessage.push([messageUserInfo + "\n\`\`\`diff\n" + messageAmmo + " \`\`\`" + messageReward, "ESCAPE SUCCESSFULLY"]);
                }
                else {
                    await interaction.editReply({ embeds: [interaction.client.redEmbed(messageUserInfo + "\`\`\`diff\n" + messageAmmo + " \`\`\`" + messageReward, "ESCAPE FAILED! Ship is destroyed!")], components: [row] });
                    logMessage.push([messageUserInfo + "\n\`\`\`diff\n" + messageAmmo + " \`\`\`" + messageReward, "ESCAPE FAILED! Ship is destroyed!"]);
                }
            }
            else if (userStats[1] > 0) {
                await interaction.editReply({ embeds: [interaction.client.greenEmbed(messageUserInfo + "\`\`\`diff\n" + messageAmmo + " \`\`\`" + messageReward, "VICTORY!")], components: [row] });
                logMessage.push([messageUserInfo + "\n\`\`\`diff\n" + messageAmmo + " \`\`\`" + messageReward, "VICTORY!"]);

                let userResources = await interaction.client.databaseSelcetData("SELECT resources FROM users WHERE user_id = ?", [interaction.user.id]);

                userResources = await userResources[0].resources.split("; ").map(Number);
                resources = resources.map(function (num, idx) { return num + userResources[idx]; });
                cargo = resources.reduce((a, b) => a + b);
                resources = resources.join("; ");
            }
            else {
                await interaction.editReply({ embeds: [interaction.client.redEmbed(messageUserInfo + "\`\`\`diff\n" + messageAmmo + " \`\`\`" + messageReward, "DEFEAT! Ship is destroyed!")], components: [row] });
                logMessage.push([messageUserInfo + "\n\`\`\`diff\n" + messageAmmo + " \`\`\`" + messageReward, "DEFEAT! Ship is destroyed!"]);
                if (userInfo.firm === "Terra") {
                    userInfo.map_id = 11;
                }
                else if (userInfo.firm === "Luna") {
                    userInfo.map_id = 21;
                }
                else {
                    userInfo.map_id = 31;
                }
                cargo = 0;
                resources = "0; 0; 0; 0; 0; 0; 0; 0; 0";
            }

            if ((userInfo.exp + expReward) >= expRequirement) {
                await interaction.client.databaseEditData("UPDATE users SET exp = ?, level = level + 1, credit = credit + ?, units = units + ?, honor = honor + ?, user_hp = ?, resources = ?, cargo = ?, in_hunt = 0, map_id = ? WHERE user_id = ?", [userInfo.exp + expReward - expRequirement, credit, units, honor, userStats[1], resources, cargo, userInfo.map_id, interaction.user.id]);
                logMessage[turnCounter][0] += "\n**YOU LEVELLED UP**";
            }
            else
                await interaction.client.databaseEditData("UPDATE users SET exp = exp + ?, credit = credit + ?, units = units + ?, honor = honor + ?, user_hp = ?, resources = ?, cargo = ?, in_hunt = 0, map_id = ? WHERE user_id = ?", [expReward, credit, units, honor, userStats[1], resources, cargo, userInfo.map_id, interaction.user.id]);
            await interaction.client.databaseEditData("UPDATE user_cd SET last_repair = ? WHERE user_id = ?", [new Date(), interaction.user.id]);
            await interaction.client.databaseEditData("UPDATE ammunition SET x1_magazine = x1_magazine - ?, x2_magazine = x2_magazine - ?, x3_magazine = x3_magazine - ?, x4_magazine = x4_magazine - ?, xS1_magazine = xS1_magazine - ?, m1_magazine = m1_magazine - ?, m2_magazine = m2_magazine - ?, m3_magazine = m3_magazine - ?, m4_magazine = m4_magazine - ?, h1_magazine = h1_magazine - ?, h2_magazine = h2_magazine - ?, hS1_magazine = hS1_magazine - ?, hS2_magazine = hS2_magazine - ? WHERE user_id = ?",
                [ammunition[0].x1_magazine - userLaserConfig[1][3], ammunition[0].x2_magazine - userLaserConfig[2][3], ammunition[0].x3_magazine - userLaserConfig[3][3], ammunition[0].x4_magazine - userLaserConfig[4][3], ammunition[0].xS1_magazine - userLaserConfig[5][3], ammunition[0].m1_magazine - userMissileConfig[1][2], ammunition[0].m2_magazine - userMissileConfig[2][2], ammunition[0].m3_magazine - userMissileConfig[3][2], ammunition[0].m4_magazine - userMissileConfig[4][2], ammunition[0].h1_magazine - userHellstormConfig[1][3], ammunition[0].h2_magazine - userHellstormConfig[2][3], ammunition[0].hS1_magazine - userHellstormConfig[3][3], ammunition[0].hS2_magazine - userHellstormConfig[4][3], interaction.user.id]);
            await interaction.client.databaseEditData("UPDATE user_ships SET ship_current_hp = ? WHERE user_id = ? and equipped = 1", [userStats[1], interaction.user.id]);
            if (missionTaskLeft != -5 && missionTaskLeft != 0) {
                if (missionTaskLeft.length > 1)
                    missionTaskLeft = missionTaskLeft.join(';');
                else
                    missionTaskLeft = missionTaskLeft[0];
                await interaction.client.databaseEditData("UPDATE user_missions SET mission_task_left = ? WHERE user_id = ? AND id = ?", [missionTaskLeft, interaction.user.id, mission[0].id]);
            }
            buttonHandler(interaction, interaction.user.id, logMessage);
        }
        catch (error) {
            if (interaction.replied) {
                await interaction.editReply({ embeds: [interaction.client.redEmbed(interaction.client.getWordLanguage(serverSettings.lang, 'catchError'), "Error!!")], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [interaction.client.redEmbed(interaction.client.getWordLanguage(serverSettings.lang, 'catchError'), "Error!!")], ephemeral: true });
            }

            errorLog.error(error.message, { 'command_name': interaction.commandName });
        }

    }
}

const row = new MessageActionRow()
    .addComponents(
        new MessageButton()
            .setCustomId('back')
            //.setLabel('Beginning')
            .setEmoji('887811358509379594')
            .setStyle('PRIMARY'),
        new MessageButton()
            .setCustomId('next')
            //.setLabel('Ending')
            .setEmoji('887811358438064158')
            .setStyle('PRIMARY'),
        new MessageButton()
            .setCustomId('download')
            //.setLabel('Ending')
            .setEmoji('887979579619295284')
            .setStyle('SUCCESS'),

    );



function buttonHandler(interaction, userID, logMessage) {
    let maxIndex = logMessage.length - 1;
    let index = maxIndex;
    let downloaded = false;

    const filter = i => i.user.id === interaction.user.id && i.message.interaction.id === interaction.id;

    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });

    collector.on('collect', async i => {
        collector.resetTimer({ time: 15000 });
        if (i.customId === 'download') {
            await interaction.editReply({ embeds: [], components: [], files: [`./Last_hunt_log/${userID}.txt`] });
            downloaded = true;
            collector.stop("Download");
        }
        else if (i.customId === 'back') {
            index--;
        }
        else if (i.customId === 'next') {
            index++;
        }
        else {
            await i.update({});
            return;
        }
        if (index < 0) {
            index += maxIndex + 1;
        }
        if (index > maxIndex) {
            index -= maxIndex + 1;
        }
        if (!downloaded) {
            await i.update({ embeds: [interaction.client.blueEmbed(logMessage[index][0], logMessage[index][1])] });
        }
    });

    var fs = require('fs');

    var file = fs.createWriteStream(`./Last_hunt_log/${userID}.txt`);
    file.on('error', function (err) { console.log(`ERROR on creating log FILE for user: ${userID}`) });

    let newLogMessage = logMessage.slice();
    for (index in logMessage) {
        let message1 = logMessage[index][1].replaceAll("*", "").replaceAll("diff", "").replaceAll("`", "").replaceAll("ini", "").replaceAll("json", "").replaceAll("css", "").replaceAll("yaml", "").replaceAll("_", "");
        let message2 = logMessage[index][0].replaceAll("*", "").replaceAll("diff", "").replaceAll("`", "").replaceAll("ini", "").replaceAll("json", "").replaceAll("css", "").replaceAll("yaml", "") + "\n\n----------------------------------\n";
        newLogMessage[index] = [message1, message2];
    }
    newLogMessage.forEach(function (v) { file.write(v.join('\n\n ') + '\n'); });
    file.end();

    collector.on('end', collected => {
        if (!downloaded)
            interaction.editReply({ components: [] })
        //interaction.editReply({ embeds: [], components: [], files: [`./User_Log/${userID}.txt`]})
    });
}

async function getAlien(aliens, addition = 0) {
    let indexList = [];
    let index = 0;
    for (index; index < aliens.length; index++) {
        indexList = indexList.concat(Array(aliens[index].encounter_chance).fill(index));
    }
    indexList = indexList.sort(() => Math.random() - 0.5);
    index = indexList[Math.floor(Math.random() * (100 + addition * 40))];
    let resources = aliens[index].resources.split("; ").map(Number);
    return [aliens[index].damage, aliens[index].alien_hp, aliens[index].alien_shield, aliens[index].alien_speed, aliens[index].alien_penetration / 100, aliens[index].shield_absortion_rate / 100, aliens[index].alien_name, aliens[index].credit, aliens[index].units, aliens[index].exp_reward, aliens[index].honor, resources, aliens[index].emoji_id, aliens[index].alien_hp, aliens[index].alien_shield];
}

function battleButtonHandler(nextButton = false) {
    let runRow = 0;
    if (nextButton) {
        runRow = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId("Run")
                    .setLabel("ESCAPE")
                    .setStyle("DANGER"),
                new MessageButton()
                    .setCustomId("NextAlien")
                    .setLabel("NEXT")
                    .setStyle("PRIMARY"),

            );
    }
    else {
        runRow = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId("Run")
                    .setLabel("ESCAPE")
                    .setStyle("DANGER"),
            );
    }
    return runRow;
}


async function missionHandler(interaction, aliens, id) {
    let missionTask = 0;
    let missionTaskLeft = 0;
    let reward = 0;
    let total = 0;
    let mission = await interaction.client.databaseSelcetData("SELECT * FROM user_missions INNER JOIN missions ON user_missions.mission_id = missions.mission_id WHERE user_missions.user_id = ? AND user_missions.mission_status = 'active'", [interaction.user.id]);
    let initialTotal = 0;
    mission = mission[0];
    if (typeof mission !== 'undefined') {
        if (mission.map_id != 0 && mission.map_id != id)
            mission = false;
        else {
            id = mission.id
            missionTask = mission.mission_task.split(";");
            missionTaskLeft = mission.mission_task_left.split(";").map(Number);
            missionTaskLeft.push(0);
            for (let index in missionTask) {
                total += missionTaskLeft[index];
            }
            if (missionTask.some(r => aliens.includes(r))) {
                reward = { credit: mission.mission_reward_credit, units: mission.mission_reward_units, exp: mission.mission_reward_exp, honor: mission.mission_reward_honor };
                if (mission.mission_limit > 0) {
                    let missionEndTime = Date.parse(mission.mission_started_at) + (mission.mission_limit * 60 * 60 * 1000);
                    let currentTime = new Date().getTime();
                    let distance = missionEndTime - currentTime;
                    mission = true;
                    if (distance < 0) {
                        await interaction.client.databaseEditData(`update user_missions set mission_status = ? where id = ?`, ["expired", id])
                        mission = false;
                    }
                }
                else
                    mission = true;
            }
            else
                mission = false;
        }
        initialTotal = total;
    }
    return {
        active: mission,
        reward: reward,
        isCompleted: async function (alien, boost) {
            if (mission) {
                let index = missionTask.indexOf(alien);
                if (missionTaskLeft[index]) {
                    total -= 1;
                    missionTaskLeft[index] -= 1;
                }
                else
                    return false;
                if (total == 0) {
                    mission = false;

                    await interaction.client.databaseEditData(`update user_missions set mission_status = ?, mission_task_left = ? where id = ?`, ["completed", "0", id])

                    let messageReward = "\`\`\`yaml\n";
                    if (boost.honor && boost.exp)
                        messageReward += `Credits       :  ${reward.credit}\nUnits         :  ${reward.units}\nEXP           :  ${reward.exp} + [${~~(reward.exp * 0.1)}]\nHonor         :  ${reward.honor} + [${~~(reward.honor * 0.1)}]` + " \`\`\`";
                    else if (boost.honor)
                        messageReward += `Credits       :  ${reward.credit}\nUnits         :  ${reward.units}\nEXP           :  ${reward.exp}\nHonor         :  ${reward.honor} + [${~~(reward.honor * 0.1)}]` + " \`\`\`";
                    else if (boost.exp)
                        messageReward += `Credits       :  ${reward.credit}\nUnits         :  ${reward.units}\nEXP           :  ${reward.exp} + [${~~(reward.exp * 0.1)}]\nHonor         :  ${reward.honor}` + " \`\`\`";
                    else
                        messageReward += `Credits       :  ${reward.credit}\nUnits         :  ${reward.units}\nEXP           :  ${reward.exp}\nHonor         :  ${reward.honor}` + " \`\`\`";

                    await interaction.followUp({ embeds: [interaction.client.yellowEmbed(messageReward, "Mission Completed!")] });

                    return true;
                }
            }
            return false;
        },
        update: async function () {
            if (mission) {
                if (initialTotal > total) {
                    missionTaskLeft.pop();
                    missionTaskLeft = missionTaskLeft.join(';');
                    await interaction.client.databaseEditData("UPDATE user_missions SET mission_task_left = ? WHERE id = ?", [missionTaskLeft, id]);
                    return true;
                }
            }
            return false;
        }
    }

}

async function infoHandler(interaction) {
    let userInfo = await interaction.client.getUserAccount(interaction.user.id);
    if (userInfo.in_hunt === 1) {
        await interaction.followUp({ embeds: [interaction.client.redEmbed(`You are already in a battle`, "Battle in progress...")], ephemeral: true });
        return { canHunt: false }
    }

    let userCd = await interaction.client.databaseSelcetData("SELECT last_hunt, last_repair, moving_to_map FROM user_cd WHERE user_id = ?", [interaction.user.id]);
    userInfo.user_hp = ~~(userInfo.user_hp + userInfo.repair_rate * (Date.now() - Date.parse(userCd[0].last_repair)) / 60000)
    if (userInfo.user_hp > userInfo.max_hp)
        userInfo.user_hp = userInfo.max_hp;

    let ship = await interaction.client.databaseSelcetData("SELECT ships_info.emoji_id, user_ships.ship_model FROM user_ships INNER JOIN ships_info ON user_ships.ship_model = ships_info.ship_model WHERE  user_ships.user_id = ?", [interaction.user.id]);
    let mapIDFrist = ~~userInfo.map_id / 10;
    let mapIDSecond = ~~((userInfo.map_id % 1.0) * 10);

    let userStats = {
        laserDamage: userInfo.user_damage,
        hp: userInfo.user_hp,
        maxShield: userInfo.max_shield,
        shield: userInfo.user_shield,
        speed: userInfo.user_speed,
        penetration: userInfo.user_penetration / 100,
        absorptionRate: userInfo.absorption_rate / 100,
        laserQuantity: userInfo.laser_quantity,
        shipEmoji: ship.emoji_id
    };

    if (ship.ship_model === "S5") {
        if (mapIDSecond < 5 && ((userInfo.firm === "Luna" && mapIDFrist == 2) || (userInfo.firm === "Terra" && mapIDFrist == 1) || (userInfo.firm === "Marte" && mapIDFrist == 3))) {
            userStats.hp += 60000;
            userStats.laserDamage *= 2;
            userStats.shield *= 2;
            userStats.maxShield *= 2;
        }
    }

    let boost = await interaction.client.databaseSelcetData("SELECT * FROM boost WHERE user_id = ?", [interaction.user.id]);

    if (Math.floor((Date.now() - Date.parse(boost[0].hp_boost)) / 1000) < 0)
        userStats.hp = ~~(userStats.hp * 1.1);
    if (Math.floor((Date.now() - Date.parse(boost[0].damage_boost)) / 1000) < 0)
        userStats.laserDamage = ~~(userStats.laserDamage * 1.1);
    if (Math.floor((Date.now() - Date.parse(boost[0].shield_boost)) / 1000) < 0) {
        userStats.shield = ~~(userStats.shield * 1.2);
        userStats.maxShield = ~~(userStats.maxShield * 1.2);
    }

    let expBoost = false;
    let honorBoost = false;
    if (Math.floor((Date.now() - Date.parse(boost[0].exp_boost)) / 1000) < 0)
        expBoost = true;
    if (Math.floor((Date.now() - Date.parse(boost[0].honor_boost)) / 1000) < 0)
        honorBoost = true;

    await interaction.client.databaseEditData("UPDATE users SET in_hunt = 1 WHERE user_id = ?", [interaction.user.id]);

    let huntConfiguration = await interaction.client.databaseSelcetData("SELECT * FROM hunt_configuration WHERE user_id = ?", [interaction.user.id]);
    huntConfiguration = huntConfiguration[0];
    huntConfiguration.pop();
    let ammunition = await interaction.client.databaseSelcetData("SELECT * FROM ammunition WHERE user_id = ?", [interaction.user.id]);
    ammunition = ammunition[0];
    ammunition.pop();

    let userLaserConfig = [
        { location: 1, threshold: huntConfiguration.x1, damage: 1, shieldDamage: 0, magazine: ~~(ammunition.x1_magazine / userStats.laserQuantity), name: "x1" },
        { location: 2, threshold: huntConfiguration.x2, damage: 2, shieldDamage: 0, magazine: ~~(ammunition.x2_magazine / userStats.laserQuantity), name: "x2" },
        { location: 3, threshold: huntConfiguration.x3, damage: 3, shieldDamage: 0, magazine: ~~(ammunition.x4_magazine / userStats.laserQuantity), name: "x3" },
        { location: 4, threshold: huntConfiguration.x4, damage: 4, shieldDamage: 0, magazine: ~~(ammunition.x4_magazine / userStats.laserQuantity), name: "x4" },
        { location: 5, threshold: huntConfiguration.xS1, damage: 0, shieldDamage: 2, magazine: ~~(ammunition.xS1_magazine / userStats.laserQuantity), name: "xS1" }
    ];
    let userMissileConfig = [
        { location: 1, threshold: huntConfiguration.m1, damage: 1000, magazine: ammunition.m1_magazine, name: "m1" },
        { location: 2, threshold: huntConfiguration.m2, damage: 2000, magazine: ammunition.m2_magazine, name: "m2" },
        { location: 3, threshold: huntConfiguration.m3, damage: 4000, magazine: ammunition.m3_magazine, name: "m3" },
        { location: 4, threshold: huntConfiguration.m4, damage: 6000, magazine: ammunition.m4_magazine, name: "m4" }
    ];
    let userHellstormConfig = [
        { location: 1, threshold: huntConfiguration.h1, damage: 10000, shieldDamage: 0, magazine: ~~(ammunition.h1_magazine / huntConfiguration.helstorm_missiles_number), name: "h1" },
        { location: 2, threshold: huntConfiguration.h2, damage: 20000, shieldDamage: 0, magazine: ~~(ammunition.h2_magazine / huntConfiguration.helstorm_missiles_number), name: "h2" },
        { location: 3, threshold: huntConfiguration.hS1, damage: 0, shieldDamage: 12500, magazine: ~~(ammunition.hS1_magazine / huntConfiguration.helstorm_missiles_number), name: "hS1" },
        { location: 4, threshold: huntConfiguration.hS2, damage: 0, shieldDamage: 25000, magazine: ~~(ammunition.hS2_magazine / huntConfiguration.helstorm_missiles_number), name: "hS2" }
    ];


    userLaserConfig.push({ location: 0, threshold: -2, damage: 0, shieldDamage: 0, magazine: 1000000, name: "No AMMO" });
    userLaserConfig = userLaserConfig.sort(function (a, b) {
        return a.threshold - b.threshold;
    });
    let laserCounter = userLaserConfig.length - 1;

    userMissileConfig.push({ location: 0, threshold: -2, damage: 0, magazine: 1000000, name: "No AMMO" });
    userMissileConfig = userMissileConfig.sort(function (a, b) {
        return a.threshold - b.threshold;
    });
    let missileCounter = userMissileConfig.length - 1;

    userHellstormConfig.push({ location: 0, threshold: -2, damage: 0, shieldDamage: 0, magazine: 1000000, name: "No AMMO" });
    userHellstormConfig = userHellstormConfig.sort(function (a, b) {
        return a.threshold - b.threshold;
    });
    let hellstormCounter = userHellstormConfig.length - 1;

    let messageAmmo = "";

    if (huntConfiguration.hellstorm == 0 && huntConfiguration.missile == 0) {
        return {
            canHunt: true,
            userStats: userStats,
            boost: { exp: expBoost, honor: honorBoost },
            ammunition: async function (threshold, turn) {
                while (!userLaserConfig[laserCounter].magazine || threshold <= userLaserConfig[laserCounter].threshold) {
                    if (!userLaserConfig[laserCounter].magazine) {
                        messageAmmo += `\n- **${interaction.user.username}**'s Laser (${userLaserConfig[laserCounter].name}) out of AMMO`;
                        userLaserConfig.splice(laserCounter, 1);
                    }
                    laserCounter -= 1;
                }
                userLaserConfig[laserCounter].magazine -= 1;
                return { laser: userLaserConfig[laserCounter], missile: { location: 0, threshold: 0, damage: 0, shieldDamage: 0, magazine: 1000000, name: "Disabled" }, hellstorm: { location: 0, threshold: 0, damage: 0, shieldDamage: 0, magazine: 1000000, name: "Disabled" }, message: messageAmmo };
            },
            update: async function () {

                userLaserConfig = userLaserConfig.sort(function (a, b) {
                    return a.location - b.location;
                });

                await interaction.client.databaseEditData("UPDATE ammunition SET x1_magazine = x1_magazine - ?, x2_magazine = x2_magazine - ?, x3_magazine = x3_magazine - ?, x4_magazine = x4_magazine - ?, xS1_magazine = xS1_magazine - ? WHERE user_id = ?",
                    [ammunition.x1_magazine - userLaserConfig[1].magazine, ammunition.x2_magazine - userLaserConfig[2].magazine, ammunition.x3_magazine - userLaserConfig[3].magazine, ammunition.x4_magazine - userLaserConfig[4].magazine, ammunition.xS1_magazine - userLaserConfig[5].magazine, interaction.user.id]);
            }
        }
    }
    else {
        if (huntConfiguration.hellstorm == 0) {
            return {
                canHunt: true,
                userStats: userStats,
                boost: { exp: expBoost, honor: honorBoost },
                ammunition: async function (threshold, turn) {
                    while (!userLaserConfig[laserCounter].magazine || threshold <= userLaserConfig[laserCounter].threshold) {
                        if (!userLaserConfig[laserCounter].magazine) {
                            messageAmmo += `\n- **${interaction.user.username}**'s Laser (${userLaserConfig[laserCounter].name}) out of AMMO`;
                            userLaserConfig.splice(laserCounter, 1);
                        }
                        laserCounter -= 1;
                    }
                    userLaserConfig[laserCounter].magazine -= 1;
                    if (!turn % 3) {
                        while (!userMissileConfig[missileCounter].magazine || threshold <= userMissileConfig[missileCounter].threshold) {
                            if (!userMissileConfig[missileCounter].magazine) {
                                messageAmmo += `\n- **${interaction.user.username}**'s Missile (${userMissileConfig[missileCounter].name}) out of AMMO`;
                                userMissileConfig.splice(missileCounter, 1);
                            }
                            missileCounter -= 1;
                        }
                        userMissileConfig[missileCounter].magazine -= 1;
                    }
                    return { laser: userLaserConfig[laserCounter], missile: userMissileConfig[missileCounter], hellstorm: { location: 0, threshold: 0, damage: 0, shieldDamage: 0, magazine: 1000000, name: "Disabled" }, message: messageAmmo };
                },
                update: async function () {

                    userLaserConfig = userLaserConfig.sort(function (a, b) {
                        return a.location - b.location;
                    });
                    userMissileConfig = userMissileConfig.sort(function (a, b) {
                        return a.location - b.location;
                    });
                    await interaction.client.databaseEditData("UPDATE ammunition SET x1_magazine = x1_magazine - ?, x2_magazine = x2_magazine - ?, x3_magazine = x3_magazine - ?, x4_magazine = x4_magazine - ?, xS1_magazine = xS1_magazine - ?, m1_magazine = m1_magazine - ?, m2_magazine = m2_magazine - ?, m3_magazine = m3_magazine - ?, m4_magazine = m4_magazine - ? WHERE user_id = ?",
                        [ammunition.x1_magazine - userLaserConfig[1].magazine, ammunition.x2_magazine - userLaserConfig[2].magazine, ammunition.x3_magazine - userLaserConfig[3].magazine, ammunition.x4_magazine - userLaserConfig[4].magazine, ammunition.xS1_magazine - userLaserConfig[5].magazine, ammunition.m1_magazine - userMissileConfig[1].magazine, ammunition.m2_magazine - userMissileConfig[2].magazine, ammunition.m3_magazine - userMissileConfig[3].magazine, ammunition.m4_magazine - userMissileConfig[4].magazine, interaction.user.id]);
                }
            }
        }
        if (huntConfiguration.missile == 0) {
            return {
                canHunt: true,
                userStats: userStats,
                boost: { exp: expBoost, honor: honorBoost },
                ammunition: async function (threshold, turn) {
                    while (!userLaserConfig[laserCounter].magazine || threshold <= userLaserConfig[laserCounter].threshold) {
                        if (!userLaserConfig[laserCounter].magazine) {
                            messageAmmo += `\n- **${interaction.user.username}**'s Laser (${userLaserConfig[laserCounter].name}) out of AMMO`;
                            userLaserConfig.splice(laserCounter, 1);
                        }
                        laserCounter -= 1;
                    }
                    userLaserConfig[laserCounter].magazine -= 1;
                    if (!turn % 6) {
                        while (!userHellstormConfig[hellstormCounter].magazine || threshold <= userHellstormConfig[hellstormCounter].threshold) {
                            if (!userHellstormConfig[hellstormCounter].magazine) {
                                messageAmmo += `\n- **${interaction.user.username}**'s Hellstorm (${userHellstormConfig[hellstormCounter].name}) out of AMMO`;
                                userHellstormConfig.splice(hellstormCounter, 1);
                            }
                            hellstormCounter -= 1;
                        }
                        userHellstormConfig[hellstormCounter].magazine -= 1;
                    }
                    return { laser: userLaserConfig[laserCounter], missile: { location: 0, threshold: 0, damage: 0, shieldDamage: 0, magazine: 1000000, name: "Disabled" }, hellstorm: userHellstormConfig[hellstormCounter], message: messageAmmo };
                },
                update: async function () {

                    userLaserConfig = userLaserConfig.sort(function (a, b) {
                        return a.location - b.location;
                    });
                    userHellstormConfig = userHellstormConfig.sort(function (a, b) {
                        return a.location - b.location;
                    });

                    await interaction.client.databaseEditData("UPDATE ammunition SET x1_magazine = x1_magazine - ?, x2_magazine = x2_magazine - ?, x3_magazine = x3_magazine - ?, x4_magazine = x4_magazine - ?, xS1_magazine = xS1_magazine - ?, h1_magazine = h1_magazine - ?, h2_magazine = h2_magazine - ?, hS1_magazine = hS1_magazine - ?, hS2_magazine = hS2_magazine - ? WHERE user_id = ?",
                        [ammunition.x1_magazine - userLaserConfig[1].magazine, ammunition.x2_magazine - userLaserConfig[2].magazine, ammunition.x3_magazine - userLaserConfig[3].magazine, ammunition.x4_magazine - userLaserConfig[4].magazine, ammunition.xS1_magazine - userLaserConfig[5].magazine, ammunition.h1_magazine - userHellstormConfig[1].magazine, ammunition.h2_magazine - userHellstormConfig[2].magazine, ammunition.hS1_magazine - userHellstormConfig[3].magazine, ammunition.hS2_magazine - userHellstormConfig[4].magazine, interaction.user.id]);
                }
            }
        }
        return {
            canHunt: true,
            userStats: userStats,
            boost: { exp: expBoost, honor: honorBoost },
            ammunition: async function (threshold, turn) {
                while (!userLaserConfig[laserCounter].magazine || threshold <= userLaserConfig[laserCounter].threshold) {
                    if (!userLaserConfig[laserCounter].magazine) {
                        messageAmmo += `\n- **${interaction.user.username}**'s Laser (${userLaserConfig[laserCounter].name}) out of AMMO`;
                        userLaserConfig.splice(laserCounter, 1);
                    }
                    laserCounter -= 1;
                }
                userLaserConfig[laserCounter].magazine -= 1;
                if (!turn % 3) {
                    while (!userMissileConfig[missileCounter].magazine || threshold <= userMissileConfig[missileCounter].threshold) {
                        if (!userMissileConfig[missileCounter].magazine) {
                            messageAmmo += `\n- **${interaction.user.username}**'s Missile (${userMissileConfig[missileCounter].name}) out of AMMO`;
                            userMissileConfig.splice(missileCounter, 1);
                        }
                        missileCounter -= 1;
                    }
                    userMissileConfig[missileCounter].magazine -= 1;
                }
                if (!turn % 6) {
                    while (!userHellstormConfig[hellstormCounter].magazine || threshold <= userHellstormConfig[hellstormCounter].threshold) {
                        if (!userHellstormConfig[hellstormCounter].magazine) {
                            messageAmmo += `\n- **${interaction.user.username}**'s Hellstorm (${userHellstormConfig[hellstormCounter].name}) out of AMMO`;
                            userHellstormConfig.splice(hellstormCounter, 1);
                        }
                        hellstormCounter -= 1;
                    }
                    userHellstormConfig[hellstormCounter].magazine -= 1;
                }
                return { laser: userLaserConfig[laserCounter], missile: userMissileConfig[missileCounter], hellstorm: userHellstormConfig[hellstormCounter], message: messageAmmo };
            },
            update: async function () {

                userLaserConfig = userLaserConfig.sort(function (a, b) {
                    return a.location - b.location;
                });
                userMissileConfig = userMissileConfig.sort(function (a, b) {
                    return a.location - b.location;
                });
                userHellstormConfig = userHellstormConfig.sort(function (a, b) {
                    return a.location - b.location;
                });

                await interaction.client.databaseEditData("UPDATE ammunition SET x1_magazine = x1_magazine - ?, x2_magazine = x2_magazine - ?, x3_magazine = x3_magazine - ?, x4_magazine = x4_magazine - ?, xS1_magazine = xS1_magazine - ?, m1_magazine = m1_magazine - ?, m2_magazine = m2_magazine - ?, m3_magazine = m3_magazine - ?, m4_magazine = m4_magazine - ?, h1_magazine = h1_magazine - ?, h2_magazine = h2_magazine - ?, hS1_magazine = hS1_magazine - ?, hS2_magazine = hS2_magazine - ? WHERE user_id = ?",
                    [ammunition.x1_magazine - userLaserConfig[1].magazine, ammunition.x2_magazine - userLaserConfig[2].magazine, ammunition.x3_magazine - userLaserConfig[3].magazine, ammunition.x4_magazine - userLaserConfig[4].magazine, ammunition.xS1_magazine - userLaserConfig[5].magazine, ammunition.m1_magazine - userMissileConfig[1].magazine, ammunition.m2_magazine - userMissileConfig[2].magazine, ammunition.m3_magazine - userMissileConfig[3].magazine, ammunition.m4_magazine - userMissileConfig[4].magazine, ammunition.h1_magazine - userHellstormConfig[1].magazine, ammunition.h2_magazine - userHellstormConfig[2].magazine, ammunition.hS1_magazine - userHellstormConfig[3].magazine, ammunition.hS2_magazine - userHellstormConfig[4].magazine, interaction.user.id]);
            }
        }
    }
}

async function playerHandler(interaction, aliens, mapID) {
    let playerInfo = await infoHandler(interaction);
    if (playerInfo.canHunt)
        return {
            active: true,
            mission: await missionHandler(interaction, aliens, mapID),
            info: playerInfo,
            update: async function () {
                this.mission.update();
                this.info.update();
            }
        }
    return { active: false }
}
