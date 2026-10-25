package service

import (
	"errors"
	"fmt"
	"project/internal/handler"
	"project/internal/models"
	"regexp"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

type AuthStorage interface {
	CreateUser(user models.UserInput) (*models.UserJSON, error)
	FindUserByUsername(username string) (*models.User, error)
}

type AuthService struct {
	db AuthStorage
}

func NewAuthService(db AuthStorage) *AuthService {
	return &AuthService{
		db: db,
	}
}

// Константы
const bcryptCost = 10

func hashPassword(password []byte) ([]byte, error) {
	// GenerateFromPassword выполняет bcrypt алгоритм хэширования
	// по умолчанию будет установлена стоимость 10.
	// Не более 72 байт длина, длина хэша всегда 60 символов
	hashedPassword, err := bcrypt.GenerateFromPassword(password, bcryptCost)
	if err != nil {
		return []byte{}, err
	}

	return hashedPassword, nil
}

func lenValidate(user models.UserInput) error {
	runeCountUsername := utf8.RuneCountInString(user.Username)
	runeCountPassword := utf8.RuneCountInString(user.Password)

	if runeCountUsername < 3 {
		return errors.New(handler.ShortUsernameLen)
	}
	if runeCountUsername > 128 {
		return errors.New(handler.LongUsernameLen)
	}

	if runeCountPassword < 8 {
		return errors.New(handler.ShortPasswordLen)
	}
	if runeCountPassword > 64 {
		return errors.New(handler.LongPasswordLen)
	}

	return nil
}

func passwordValidate(password string) error {
	// Проверка наличия латинских букв a-zA-Z и цифр
	// ^ - начинается с [a-zA-z0-9]
	// $ - заканчивается на [a-zA-z0-9]
	// [] - ровно 1 символ из последовательности
	// [a-zA-z0-9] - либо a-z, либо A-Z, либо только 0-9 в любой части строки
	// + - предыдущий символ встречается 1 или больше раз
	re, _ := regexp.Compile("^[A-Za-z0-9]+$")
	reLetter, _ := regexp.Compile("[A-Za-z]+")
	reDigit, _ := regexp.Compile("[0-9]+")

	if !re.MatchString(password) {
		return errors.New(handler.NotValidSymbols)
	}

	if !reLetter.MatchString(password) {
		return errors.New(handler.OnlyLatinSymbol)
	}

	if !reDigit.MatchString(password) {
		return errors.New(handler.AlwaysDigit)
	}

	return nil
}

func (a *AuthService) Register(user models.UserInput) (*models.UserJSON, error) {
	if err := lenValidate(user); err != nil {
		return nil, err
	}

	if err := passwordValidate(user.Password); err != nil {
		return nil, err
	}

	bytePassword := []byte(user.Password)
	hashedPassword, err := hashPassword(bytePassword)
	if err != nil {
		fmt.Println(err)
		return nil, errors.New(handler.InternalServerError)
	}
	user.Password = string(hashedPassword)

	userResult, err := a.db.CreateUser(user)
	if err != nil {
		fmt.Println(err)
		return nil, err
	}

	return userResult, nil
}

func (a *AuthService) Login(user models.UserInput) (*models.UserJSON, error) {
	if err := lenValidate(user); err != nil {
		return nil, err
	}

	userData, err := a.db.FindUserByUsername(user.Username)
	if err != nil {
		fmt.Println(err)
		return nil, errors.New(handler.UserNotExists)
	}

	// Проверяем, что введенный пароль соответствует
	// хэшу пароля из БД
	if err := bcrypt.CompareHashAndPassword([]byte(userData.Password), []byte(user.Password)); err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return nil, errors.New(handler.UserNotExists)
		}
		fmt.Println(err)
		return nil, errors.New(handler.PasswordCheckError)
	}

	userResult := models.UserJSON{}

	userResult.ID = userData.ID
	userResult.Username = userData.Username
	userResult.CreatedAt = userData.CreatedAt

	return &userResult, nil
}
