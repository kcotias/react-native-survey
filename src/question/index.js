import React, { Component } from 'react';
import {
  Text,
  View,
  Image,
  NetInfo,
  Linking,
  Platform,
  AsyncStorage,
  TouchableOpacity
} from 'react-native';
import { CheckBox } from 'react-native-elements';
import PropTypes from 'prop-types';
import Modal from 'react-native-modal';
import moment from 'moment';


import {
  RatingQuestionComponent,
  MultipleChoiceQuestionComponent,
  TextQuestionComponent
} from '../components';
import { Questions } from '../functions';
import deviceInfo from '../deviceInfo';
import icons from '../../config/icons';
import styles from './styles';

const APPLENATIVE_PREFIX = 'itms-apps://itunes.apple.com/app/id';
const GOOGLE_PREFIX = 'http://play.google.com/store/apps/details?id=';

class Question extends Component {
  constructor(props) {
    super(props);
    this.state = {
      visible: false,
      response: null,
      rating: 0,
      questionVisibile: false,
      user: {
        userInfo: props.userInfo ? props.userInfo : null,
        deviceInfo,
        uniqueID: deviceInfo.uniqueID
      },
      survey: null,
      question: null,
      sendStoreConfirmationVisible: false
    };
    this.questionUtils = new Questions(props.baseUrl, props.project);
  }

  componentWillMount() {
    this.questionUtils.configSurvey(this.configure);
    this.questionUtils.persistAnsweredsWithouNetwork();
  }

  componentWillReceiveProps(nextProps) {
    const updatedUser = this.state.user;
    updatedUser.userInfo = nextProps.userInfo;
    this.setState({ user: updatedUser });
  }

  onPressCheckBox = (response, ratingNumber = null) => {
    const newQuestionWithAlternatives = this.state.question;
    newQuestionWithAlternatives.question.alternatives = this.handleCheckAlternatives(response);
    this.setState({
      response,

      rating: ratingNumber !== null ? ratingNumber : response,
      question: newQuestionWithAlternatives
    });
  }

  onchangeTextQuestion = response => this.setState({ response });

  getPreparedQuestions(questions) {
    if (questions.length > 0) {
      const preparedQuestion = [];
      questions.forEach((item, index) => {
        const question = item;
        if (item.type === 'multiple-choice' || item.type === 'rating') {
          if (typeof question.alternatives[0] !== 'object') {
            question.alternatives =
              item.alternatives.map((value, i) =>
                ({ index: i, text: value, checked: false }));
          }
        }
        preparedQuestion.push({ index, question, answered: false });
      });
      return preparedQuestion;
    }
    return [];
  }

  getAppearQuestion = (localQuestions, delay) => localQuestions.questionMap.find((item) => {
    const diff = moment(localQuestions.lastAppearance).diff(new Date().getTime(), 'days');
    return diff >= delay && !item.answered;
  });

  getEmoji(item) {
    switch (item.text) {
      case 1:
        return icons.emojiAngry;
      case 2:
        return icons.emojiSad;
      case 3:
        return icons.emojiThinking;
      case 4:
        return icons.emojiHappy;
      case 5:
        return icons.emojiLove;
      default:
        return null;
    }
  }

  getPreparedResponse = (user, response, wasStore = null) => {
    const { userInfo } = user;
    let username = 'Anônimo';
    if (userInfo) {
      const { email, name } = userInfo;
      if (email) {
        username = email;
      } else if (name) {
        username = name;
      }
    }

    if (wasStore !== null) {
      return ({
        response,
        username,
        so: Platform.OS,
        timestamp: new Date().getTime(),
        wasStore
      });
    }

    return ({
      response,
      username,
      so: Platform.OS,
      timestamp: new Date().getTime()
    });
  }

  handleAppearQuestion = (localQuestions) => {
    const question = this.getAppearQuestion(localQuestions, localQuestions.survey.appearDelay);
    if (question !== undefined) {
      this.setState({
        visible: true,
        questionVisibile: true,
        question,
        survey: localQuestions.survey
      });
    } else {
      this.setState({ visible: false });
    }
    AsyncStorage.setItem(
      '@app2sales-feedback-survey',
      JSON.stringify(localQuestions)
    );
  }

  markQuestionAsAnswered = () => {
    AsyncStorage.getItem('@app2sales-feedback-survey').then((value) => {
      const localQuestions = JSON.parse(value);
      localQuestions.questionMap = localQuestions.questionMap.map((item) => {
        const newItem = {};
        Object.assign(newItem, item);
        if (item.question.key === this.state.question.question.key) {
          newItem.answered = true;
        }
        return newItem;
      });
      AsyncStorage.setItem(
        '@app2sales-feedback-survey',
        JSON.stringify(localQuestions)
      );
    });
  }

  ratingResponse = (wasStore) => {
    const {
      response,
      user,
      question,
      survey
    } = this.state;

    this.questionUtils.onQuestionAnswered({
      question,
      response: this.getPreparedResponse(user, response, wasStore),
      user,
      survey
    }, this.markQuestionAsAnswered());
  }

  ratingSubmitAction = () => {
    const {
      response,
      question,
      rating
    } = this.state;
    if ((question.type !== 'rating') && ((response >= 4) || (rating >= 4))) {
      this.setState({ sendStoreConfirmationVisible: true, questionVisibile: false });
    } else {
      this.ratingResponse(false);
      this.closeModal();
    }
  }

  sendToStore = () => {
    const storeBaseUrl = Platform.OS === 'android' ? GOOGLE_PREFIX : APPLENATIVE_PREFIX;
    const completeUrl = `${storeBaseUrl}${deviceInfo.bundleId}`;
    Linking.canOpenURL(completeUrl).then((supported) => {
      if (supported) {
        Linking.openURL(completeUrl);
      }
    });
    this.ratingResponse(true);
  }

  handleCheckAlternatives = result => this.state.question.question.alternatives.map(item => ({
    ...item,
    checked: (result.index === item.index)
  }));

  handleMarkStars = amount => this.setState({ rating: amount, response: amount })

  closeModal = () => this.setState({ visible: false });


  multipleChoiceAlternatives = () => this.state.question.question.alternatives.map(item => (
    <CheckBox
      key={item.index}
      title={item.text}
      onPress={() => this.onPressCheckBox(item)}
      checkedIcon={'dot-circle-o'}
      uncheckedIcon={'circle-o'}
      checked={item.checked}
      containerStyle={styles.alternativeView}
      textStyle={styles.alternativeText} />
  ))

  configure = (serverSurvey) => {
    AsyncStorage.getItem('@app2sales-feedback-survey').then((value) => {
      const localSurvey = JSON.parse(value);

      const newSurveyToSave = {
        survey: serverSurvey,
        questionMap: this.getPreparedQuestions(serverSurvey.questions),
        lastFetch: new Date().getTime(),
        lastAppearance: new Date().getTime()
      };

      if (!localSurvey) {
        this.handleAppearQuestion(newSurveyToSave);
        return;
      }
      this.mergeSurvey(localSurvey, newSurveyToSave);
    });
  }

  mergeSurvey = (localSurvey, serverPreparedSurvey) => {
    const newSurvey = {};
    Object.assign(newSurvey, serverPreparedSurvey);
    newSurvey.questionMap =
      serverPreparedSurvey
        .questionMap
        .map((serverQuestionItem) => {
          const qt = localSurvey
            .questionMap
            .find(localQuestionItem =>
              ((serverQuestionItem.question.key === localQuestionItem.question.key) ||
                (serverQuestionItem.question.title === localQuestionItem.question.title)));
          if (qt) return qt;

          return serverQuestionItem;
        });
    // Handle here
    this.handleAppearQuestion(newSurvey);
  }

  renderStars = () => {
    const stars = [1, 2, 3, 4, 5].map((num) => {
      const starStyle = {
        ...styles.stars,
        tintColor: this.state.rating >= num ? '#FFE04B' : '#595959'
      };

      return (
        <TouchableOpacity
          key={num}
          onPress={() => this.handleMarkStars(num)}
          style={styles.touchableEvaluationAlternative}>
          <Image
            source={icons.star}
            style={starStyle} />
        </TouchableOpacity>
      );
    });
    return <View style={styles.starContainer}>{stars}</View>;
  }

  renderEmojis = (item) => {
    const imgStyle = item.checked ?
      { ...styles.imgEvaluationAlternative, width: 43, height: 43 } :
      { ...styles.imgEvaluationAlternative, width: 30, height: 30 };
    return (
      <TouchableOpacity
        key={item.index}
        onPress={() => this.onPressCheckBox(item, item.text)}
        style={styles.touchableEvaluationAlternative}>
        <Image
          style={imgStyle}
          source={this.getEmoji(item)} />
      </TouchableOpacity>
    );
  }

  renderRatingAlternatives = () => {
    const { question } = this.state;
    if (question.question.ratingType !== undefined && question.question.ratingType === 'emoji') {
      return question.question.alternatives.map(item => this.renderEmojis(item));
    }
    return this.renderStars();
  }

  renderButtons = (onCancel, onSubmit) => {
    const sendTextStyle = this.state.response !== null ?
      { ...styles.submitBtnText, color: '#40c3e8' } :
      { ...styles.submitBtnText, color: '#999' };
    return (
      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={styles.cancelBtnTouch}
          onPress={onCancel}>
          <Text style={styles.cancelBtnText}>CANCELAR</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={this.state.response === null}
          style={styles.SubmitBtnTouch}
          onPress={onSubmit}>
          <Text style={sendTextStyle}>ENVIAR</Text>
        </TouchableOpacity>
      </View>
    );
  }

  renderSendStoreConfirmation = () => {
    const sendTextStyle = { ...styles.submitBtnText, color: '#40c3e8' };

    return (
      <View style={styles.whiteBoxContainer}>
        <Image source={icons.especialStar} style={styles.imgSendStore} />
        <Text style={styles.sendStoreTitle}>
          Olá, nos avalie também na loja, clique no botão abaixo,
          não levará mais que 1 minuto. Muito obrigado!
        </Text>
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={styles.cancelBtnTouch}
            onPress={this.closeModal}>
            <Text style={styles.cancelBtnText}>CANCELAR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.SubmitBtnTouch}
            onPress={() => { this.closeModal(); this.sendToStore(); }}>
            <Text style={sendTextStyle}>IR A LOJA</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  renderButtonsForComponents = () => {
    const {
      question,
      response,
      user,
      survey
    } = this.state;

    return this.renderButtons(
      this.closeModal,
      () => {
        this.questionUtils.onQuestionAnswered({
          question,
          response: this.getPreparedResponse(user, response),
          user,
          survey
        }, this.markQuestionAsAnswered());
        this.closeModal();
      }
    );
  }

  renderContent = () => {
    const { question, sendStoreConfirmationVisible, questionVisibile } = this.state;

    if (sendStoreConfirmationVisible) {
      return this.renderSendStoreConfirmation();
    }

    if (question !== null && questionVisibile) {
      switch (question.question.type) {
        case 'multiple-choice':
          // return this.getComponentMultipleChoiceQuestion();
          return (
            <MultipleChoiceQuestionComponent
              title={this.props.title}
              questionTitle={this.state.question.question.title}
              renderButtons={this.renderButtonsForComponents()}
              alternatives={this.multipleChoiceAlternatives()} />
          );
        case 'text':
          // return this.getComponentTextQuestion();
          return (
            <TextQuestionComponent
              title={this.props.title}
              questionTitle={this.state.question.question.title}
              renderButtons={this.renderButtonsForComponents()}
              onchangeTextQuestion={this.onchangeTextQuestion} />);
        case 'rating':
          // return this.getComponentRatingQuestion();
          return (
            <RatingQuestionComponent
              title={this.props.title}
              questionTitle={this.state.question.question.title}
              renderButtons={
                this.renderButtons(this.closeModal, this.ratingSubmitAction)
              }
              renderRatingAlternatives={this.renderRatingAlternatives()} />
          );
        default:
          return <View />;
      }
    }
    return <View />;
  }

  render() {
    return (
      <Modal
        animationIn={'fadeIn'}
        isVisible={this.state.visible}
        style={styles.modal}>
        {this.renderContent()}
      </Modal>
    );
  }
}

Question.propTypes = {
  /* Prop used to render samples of messages
    * to make more easy the call on the father class!! */
  title: PropTypes.string,
  userInfo: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  baseUrl: PropTypes.string,
  project: PropTypes.string
};

Question.defaultProps = {
  title: 'Que tal nos dar um feedback?'
};

export default Question;
