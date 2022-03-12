const { SlashCommandBuilder } = require('@discordjs/builders');
const errorLog = require('../Utility/logger').logger;


module.exports = {
    data: new SlashCommandBuilder()
        .setName('bonus_box')
        .setDescription('Try your luck in some random boxes'),

    async execute(interaction, userInfo, serverSettings) {
        String.prototype.format = function () {
            var i = 0, args = arguments;
            return this.replace(/{}/g, function () {
                return typeof args[i] != 'undefined' ? args[i++] : '';
            });
        };

        try {
            if (userInfo.tutorial_counter < 8) {
                await interaction.reply({ embeds: [interaction.client.redEmbed(interaction.client.getWordLanguage(serverSettings.lang, 'tutorialFinish'))] });
                return;
            }

            let userCd = await interaction.client.databaseSelcetData("SELECT last_bonus_box FROM user_cd WHERE user_id = ?", [interaction.user.id]);
            let elapsedTimeFromBox = Math.floor((Date.now() - Date.parse(userCd[0].last_bonus_box)) / 1000);
            if (elapsedTimeFromBox < 60) {
                await interaction.reply({
                    embeds: [interaction.client.redEmbed(interaction.client.getWordLanguage(serverSettings.lang, 'boxCD').format(60 - elapsedTimeFromBox), interaction.client.getWordLanguage(serverSettings.lang, 'inCD'))]
                });
                return;
            }
            let box = await interaction.client.databaseSelcetData("SELECT * FROM bonus_box", []);
            let bonusBoxCD = new Date();
            //bonusBoxCD.setMinutes(bonusBoxCD.getMinutes() + 1);
            let indexList = [];
            let index = 0;
            for (index; index < box.length; index++) {
                indexList = indexList.concat(Array(box[index].chance).fill(index));
            }
            indexList = indexList.sort(() => Math.random() - 0.5)
            index = indexList[Math.floor(Math.random() * (100))];
            await interaction.client.databaseEditData(`UPDATE ${box[index].table_reward} SET ${box[index].column_reward} = ${box[index].column_reward} + ${box[index].value} WHERE user_id = ?`, [interaction.user.id]);
            await interaction.reply({ embeds: [interaction.client.greenEmbed("\`\`\`css\n" + box[index].description + "\`\`\`", interaction.client.getWordLanguage(serverSettings.lang, 'congrats'))] });
            await interaction.client.databaseEditData(`UPDATE user_cd SET last_bonus_box = ? WHERE user_id = ?`, [bonusBoxCD, interaction.user.id]);
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